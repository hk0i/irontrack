# IronTrack: architecture and bug review

**10 November 2026 · Codex · Quick review · Commit `bd7a07e`**

> **Recommendation: maintain Vue and fix data integrity and offline delivery first.** SvelteKit offers useful routing and deployment conventions, but no demonstrated benefit here large enough to justify a full UI rewrite. The highest-priority bugs survive a framework migration unless explicitly fixed.

## 1. Scope and evidence

Reviewed routing, workout logging/resume/finish, history, routine editing/sharing, backup import, Dexie schema, preferences, timers, service worker, and deployment. This is a targeted source review, not an exhaustive audit or a mobile/browser acceptance test. No application code was changed; proposed snippets below are illustrative.

| Check | Result |
|---|---|
| `npm run type-check` | Passed |
| `npm run build -- --outDir /private/tmp/irontrack-review-build` | Passed; existing `dist/` left untouched |
| Production output | One application JS bundle: **278.02 kB / 90.78 kB gzip**; CSS: 25.62 kB / 5.66 kB gzip |
| Targeted in-memory harness | Actual `checkRow` function with delayed mocked persistence: two overlapping calls produced **two writes** |
| Actual service worker in a VM with mocked browser APIs | Activation deleted an unrelated cache; a network 503 was returned unchanged |
| Numeric parser examples | Negative values, trailing text, fractional reps, and infinite weight are accepted/truncated |
| Automated regression coverage | No test script in `package.json`; Pages workflow builds without running the separate type check |

The harness verified control flow with mocks, not real IndexedDB or service-worker lifecycle behavior. Other findings below are source-confirmed paths with reproduction recipes, not claims of end-to-end execution. The build also emitted a PWA toolchain deprecation warning about `inlineDynamicImports`; it did not fail.

## 2. Architecture today

```text
                         BROWSER / INSTALLED PWA
 ┌─────────────────────────────────────────────────────────────────┐
 │ Vue Router → App.vue → feature screens → reusable UI components │
 │                          │                      │               │
 │                          ▼                      ▼               │
 │                 shared/db helpers       Vue reactive singletons │
 │                 units + aggregation     preferences / session   │
 │                          │               rest deadline          │
 │                          ▼                      ▼               │
 │                 Dexie / IndexedDB           localStorage        │
 │                 6 tables, schema v4                             │
 └─────────────────────────────────────────────────────────────────┘
            ▲
            │ app shell + assets
    Custom service worker / Cache Storage
            ▲
            │
    Vite + PWA build → GitHub Pages (/irontrack/)
                    ↘ Docker / nginx (/)
```

**Good foundations.** Feature folders are easy to navigate; the domain DB helpers centralize writes and weight conversion; backup writes are transactional; routine sharing excludes workout and body-metric history. Timestamp-based rest timers tolerate delayed background ticks better than decrementing counters. `App.vue` keys screens by `route.fullPath`, so route changes remount their setup state; the workout screen's read-once route parameters are supported by that design.

**Main architectural pressure points:**

| Boundary | Current behavior | Consequence |
|---|---|---|
| Workout lifecycle | Sets in IndexedDB; active marker in localStorage; completion in another table | No atomic session lifecycle; failure and multi-tab recovery need explicit policy |
| Domain vs screen | `ActiveWorkoutScreen.vue` is 585 lines and owns validation, persistence, grouping, resume, and UI | Async correctness is difficult to isolate and verify |
| Routine vs exercise | Group and warmup/resistance metadata live on shared exercise records | Editing one routine changes other routines using those records |
| Queries | `sessionId` is unindexed; history loads all sets; some views repeat exercise-history scans | Acceptable at small scale, but grows with lifetime history rather than the requested session |
| Delivery | All screens imported eagerly; custom network-first worker | Initial download includes all screens; cache/update policy is hand-maintained |

The app has three runtime dependencies: Vue, Vue Router, and Dexie. Its current size and local-only storage favor targeted improvements over adding a server framework solely for organization.

## 3. Bugs and correctness findings

**Priority:** P1 = fix before feature expansion; P2 = user-visible correctness/reliability fix. No critical security exploit was established.

### F1 · P1 · A set can be saved twice

**Evidence:** [ActiveWorkoutScreen.vue:285](../src/features/workout/ActiveWorkoutScreen.vue#L285), [SetRow.vue:91](../src/features/workout/SetRow.vue#L91).

`checkRow` checks `row.checked`, then awaits persistence before setting either `loggedSetId` or `checked`. The reps input's `change` event and the save button both call it. Two calls before the first write resolves both take the insert path. The harness using the extracted function confirmed two writes for one row.

**Reproduce:** enter reps and quickly tap Log set, or double-tap it with persistence delayed. Check the stored set count, not just the single visible checked row. Event timing determines how often normal input triggers this.

**Before → proposed after:**

```ts
// Before: neither field changes until after the asynchronous insert.
if (row.checked) return;
const set = await logSet(input);
row.loggedSetId = set.id;
row.checked = true;

// After: serialize saves for this row; expose failure and allow retry.
if (row.checked || row.saving) return;
row.saving = true;
try {
  await saveOrUpdateRow(row, validatedInput);
  row.checked = true;
} catch (error) {
  showSaveFailure(error);
} finally {
  row.saving = false;
}
```

Disable editing/save while pending. For retry safety across interruption, also consider assigning a stable set ID before insertion. **Acceptance:** two concurrent saves produce one record; a failed save leaves the row editable and retryable.

### F2 · P1 · Import can persist malformed data and silently overwrite changed routines

**Evidence:** [backup.ts:31](../src/shared/db/backup.ts#L31), [sharing.ts:17](../src/shared/db/sharing.ts#L17), [sharing.ts:60](../src/shared/db/sharing.ts#L60), [sharing.ts:97](../src/shared/db/sharing.ts#L97).

There are two distinct defects:

- **Shape checking stops at arrays.** A backup set with an ID but missing `date` can be stored, then crash `getAllSets()` at `date.localeCompare`. Imports also trust derived weight values, enum values, references, and version numbers. TypeScript assertions do not validate imported JSON.
- **Conflict checking compares names only.** Import an older copy of a routine with the same ID/name but a different exercise list: no conflict appears, and `bulkPut` replaces the local list. The same problem applies to exercise type/group changes. The comment says a same-name record is reused, but the implementation overwrites it.

```text
 BEFORE                                 PROPOSED AFTER
 JSON → arrays? → bulkPut               JSON → supported format/version?
                                                  ↓
                                        validate every row + references
                                                  ↓
                                        normalize canonical units
                                                  ↓
                                        compare meaningful fields
                                                  ↓
                                        preview conflicts → transaction
```

Keep legacy formats supported through explicit normalization. Compare semantic content while excluding export timestamps; apply user resolutions before committing. Treat invalid optional tables as errors rather than silently substituting empty arrays when present with the wrong type. **Acceptance:** invalid imports write nothing; changed same-name records require an explicit resolution; valid legacy backups still load.

### F3 · P1 · Worker activation deletes other apps' caches on the same origin

**Evidence:** [sw.js:47](../src/sw.js#L47).

Cache Storage is origin-wide. Activation deletes every cache except the current IronTrack cache, regardless of service-worker scope. This is especially relevant to GitHub Pages project apps sharing `hk0i.github.io`.

**Confirmed in harness:** keys `irontrack-precache-old` and `other-app-cache` were both deleted.

```js
// Before
keys.filter(key => key !== CACHE_NAME)

// After: delete only caches owned by this app.
keys.filter(key =>
  key.startsWith('irontrack-precache-') && key !== CACHE_NAME
)
```

If multiple IronTrack installations share an origin, namespace by deployment scope too. **Acceptance:** old app caches are removed and unrelated cache keys survive activation.

### F4 · P2 · Cached app fails during HTTP errors; updates can mix asset generations

**Evidence:** [sw.js:56](../src/sw.js#L56), [app-update.ts:83](../src/shared/app-update.ts#L83).

`fetch` resolves on HTTP 404/503, so the `.catch` fallback only covers network rejection. A transient HTTP error prevents use of an available cached page/asset. The VM harness confirmed that a 503 is returned unchanged.

Separately, successful network responses overwrite entries inside the active build's cache. After a deployment, an old worker can cache the new `index.html` before the new hashed JS has been cached. Going offline at that point can leave an HTML/asset generation mismatch. This is a source-derived lifecycle risk; it was not reproduced in a browser.

```text
 BEFORE: one network-first policy for all GET requests

 AFTER:  navigation ── bounded network attempt ── app-shell fallback
         hashed asset ── current-build precache first
         activation ── clean only app-owned older caches
```

Account for the existing GitHub Pages fallback: deep routes intentionally receive the app shell with a 404 status. Distinguish that navigation case from missing asset requests. Keep the app shell and its referenced assets consistent; tie background cache writes to `event.waitUntil`. **Acceptance:** test first visit, offline reload, cached navigation during 503, and deployment followed by going offline before accepting the update.

### F5 · P2 · Set validation permits invalid or silently altered numbers

**Evidence:** [ActiveWorkoutScreen.vue:291](../src/features/workout/ActiveWorkoutScreen.vue#L291), [WorkoutSessionDetailScreen.vue:175](../src/features/history/WorkoutSessionDetailScreen.vue#L175), [sets.ts:28](../src/shared/db/sets.ts#L28).

Inputs are text fields. `parseInt('3.9', 10)` becomes `3`; `parseInt('12abc', 10)` becomes `12`; negative reps and weight pass; `parseFloat('Infinity')` passes the weight `isNaN` check. Domain write helpers provide no second validation boundary. Invalid values pollute charts and totals.

```ts
// Before
const reps = parseInt(text, 10);
const valid = !Number.isNaN(reps);

// After: full-string numeric conversion plus an explicit domain rule.
const reps = Number(text);
const valid = text.trim() !== '' && Number.isSafeInteger(reps) && reps > 0;
// Weight: blank → 0; otherwise finite, nonnegative numeric value.
```

Share validation between live entry, history edits, and imports. **Acceptance:** reject fractional/negative reps, trailing text, and non-finite numbers; preserve optional zero weight. Decide explicitly whether zero reps is meaningful before enforcing that policy.

### F6 · P2 · A failed Finish leaves the screen unable to retry

**Evidence:** [ActiveWorkoutScreen.vue:357](../src/features/workout/ActiveWorkoutScreen.vue#L357).

`finishing` is set before `logWorkoutSession`, with no catch/finally. If IndexedDB rejects the write, the modal has closed, Finish remains disabled, and no useful recovery is presented. The active marker remains, so reload may recover, but the current screen cannot retry.

**Reproduce:** reject the completion write, for example with a mocked storage failure. **Proposed change:** handle the error, preserve the active marker, and reset `finishing` on failure; clear the marker only after durable completion. Make retry idempotent by session ID, including recovery after a completion write succeeded but clearing localStorage failed. **Acceptance:** failed finish can be retried without losing sets or duplicating completion.

### F7 · P2 · “Last workout” calculations confuse multiple same-day sessions

**Evidence:** [sets.ts:104](../src/shared/db/sets.ts#L104), [sets.ts:133](../src/shared/db/sets.ts#L133), [sets.ts:156](../src/shared/db/sets.ts#L156).

The app now distinguishes sessions by ID, but comparison helpers still use dates:

| Case | Current result | Expected session-based result |
|---|---|---|
| Morning 200 lb; afternoon 150 lb; start evening workout | Ghost text shows 200 | Most recent prior session: 150 |
| Open afternoon session detail | Morning workout excluded by `date < beforeDate` | Compare with morning session |
| Open morning session sparkline | Later same-day sessions can be included; equal-date ordering lacks a timestamp tie-breaker | End at the viewed session |

**Proposed change:** pass a session cursor containing ID, start time, and logical date; select the prior session first, then its best set. Use a deterministic date/created-time fallback for legacy sets. **Acceptance:** two or three same-day sessions remain correctly ordered and historical views exclude later sessions.

## 4. Architecture changes worth making in either framework

### Keep the DB layer; extract a session controller

```text
 BEFORE                                    PROPOSED AFTER
 Screen ── validation                      Screen ── rendering + user intent
        ├─ session resolution                    │
        ├─ row save/update                       ▼
        ├─ completion writes               Session controller
        └─ resume assembly                 validate / serialize / recover
                                                  │
                                                  ▼
                                           Existing domain DB helpers
                                                  │
                                                  ▼
                                           Dexie / IndexedDB
```

Reuse the existing schema and conversion helpers. Start with F1/F6; avoid a large abstraction project. A durable active/completed session record in IndexedDB would eventually let completion and lifecycle changes share a transaction, while localStorage remains appropriate for simple preferences. Keep legacy backup compatibility explicit.

### Put routine-specific metadata on routine entries

`duplicateRoutine` shares exercise IDs, while the builder immediately writes exercise type and group changes to those shared records—even before Save. Grouping a duplicated routine can therefore alter the original routine; leaving the editor does not undo those changes. Whether global resistance metadata is desirable is a product decision, but workout grouping and warmup designation usually belong to the routine placement.

```ts
// Before: grouping and warmup are shared everywhere this exercise appears.
Routine  { exerciseIds: string[] }
Exercise { id, name, groupId?, exerciseType?, resistanceType? }

// Proposed shape: catalog identity remains shared; placement is local.
Routine {
  entries: Array<{
    id: string; exerciseId: string;
    groupId: string | null; exerciseType: 'warmup' | 'regular';
  }>;
}
Exercise { id, name, resistanceType? }
```

Stage editor changes and commit on Save. A migration must preserve entry order, existing groups, legacy imports, and exercise IDs used by historical sets. Decide whether historical resistance type should be snapshotted too: current history reads present-day exercise metadata, so later edits can change how old sets are interpreted.

### Low-cost delivery and query improvements

| Proposed change | Concrete payoff | Framework switch needed? |
|---|---|---|
| Lazy-import route screens | Avoid downloading every screen at startup; measure actual benefit | No |
| Index `sets.sessionId` in a schema upgrade | Session detail/resume queries avoid full-table filters | No |
| Centralize session ordering and volume policy | Same-day correctness; avoid divergent chart definitions | No |
| Run type check in CI; add focused regression tests for F1–F7 | Prevent known failure classes from shipping | No |

History cards are built from sets, so a finished session with zero sets is invisible ([WorkoutHistoryScreen.vue:68](../src/features/history/WorkoutHistoryScreen.vue#L68)). Decide whether to disallow empty completion or display completed session rows independently. This is a product-policy gap rather than an assumed requirement.

## 5. SvelteKit: switch or maintain?

**Decision for the current product: maintain Vue.** There is no measured performance, reliability, or offline capability win that requires SvelteKit. Reconsider if server-backed features become a committed requirement or the team strongly prefers Svelte enough to fund a rewrite.

| Dimension | Maintain Vue + Vite | Switch to SvelteKit |
|---|---|---|
| Offline local workout logging | Already implemented; fix worker/lifecycle defects | Dexie and the same lifecycle rules still required |
| Routing and layouts | Explicit Vue Router configuration; add lazy imports | **Clear convention win:** file-based routes and nested layouts reduce manual route wiring |
| Route loading and errors | Add consistent screen loading/error handling | **Clear convention win:** generated route types and built-in route error/loading structure; DB validation still separate |
| Server features later | Add an API or adopt a Vue-oriented full-stack framework | **Conditional win:** server routes, actions, and SSR fit naturally if a server is actually deployed |
| Static hosting | Working Pages and nginx workflows | Supported through `adapter-static`; configure base path and dynamic-route fallback carefully |
| PWA | Existing Vite PWA integration | Service-worker support exists; custom offline/update policy still needs engineering |
| Bundle/runtime | Measured baseline: 90.78 kB JS gzip | Potential improvement, **unproven** until an equivalent production build is compared |
| UI and browser integrations | Existing components, composables, gestures, audio, wake lock | Rewrite Vue components/composables and revalidate mobile behavior |
| Data continuity | Existing origin and DB remain | Preserve origin, DB name/schema, IDs, and storage keys; changing origin requires export/import or another transfer path |
| Delivery risk | Incremental fixes; narrower regression surface | Broad rewrite with high risk around resume, groups, history editing, and updates |

SvelteKit documents [filesystem routing](https://svelte.dev/docs/kit/routing), [route types](https://svelte.dev/docs/kit/types), [static deployment](https://svelte.dev/docs/kit/adapter-static), [page rendering options](https://svelte.dev/docs/kit/page-options), and [service-worker support](https://svelte.dev/docs/kit/service-workers). These are framework capabilities; the payoff assessment above is specific to this repository.

**Important deployment constraint:** current modules access `localStorage`, `document`, and `window` during import. They cannot simply run unchanged during SSR. A static client-rendered SvelteKit build is viable, but gives up much of the SSR/server rationale. Browser-only persistence must be initialized on the client. Server actions require runtime hosting beyond GitHub Pages; a server also cannot directly read a user's browser IndexedDB. SvelteKit's [SPA guidance](https://svelte.dev/docs/kit/single-page-apps) describes fallback deployment and its tradeoffs.

```text
 SWITCHING ONLY THE UI FRAMEWORK
 Vue screens + composables  →  Svelte screens + reactive state  [rewrite]
 Vue Router                 →  SvelteKit filesystem routes     [replace]
 Dexie + domain rules        →  Dexie + domain rules             [reuse/fix]
 localStorage/browser APIs  →  client-only initialization       [adapt]
 custom PWA policy          →  explicit PWA policy              [revalidate]
 GitHub Pages + nginx       →  static adapter + base/fallback    [adapt]
```

**What switching will not automatically deliver:** sync, backups, reliable background alerts, transactional session recovery, better import validation, or corrected analytics. SSR cannot pre-render private local training data it cannot access. File-based routing is a real convenience, but this router currently has only 12 route records, so the immediate savings are modest. Nuxt is also worth comparing if future server features—not Svelte itself—become the primary motivation.

## 6. Suggested order

1. **Protect data:** fix duplicate saves, imports, and numeric validation; verify failed-write retry.
2. **Protect offline use:** isolate cache ownership and verify update/offline transitions on installed mobile PWAs and under `/irontrack/`.
3. **Correct session analytics:** order by session, then address routine-entry ownership and staged editing.
4. **Reduce maintenance cost:** extract the small session controller, lazy-load routes, add the session index and focused CI checks.
5. **Only then evaluate migration:** port one representative workout flow in an isolated experiment, reusing DB helpers. Compare identical data, production bundle size, startup on the same device, offline reload, resume, same-day history, update behavior, and developer effort. Keep deployment origin stable for a real rollout.

**Migration gate:** choose SvelteKit only when the experiment demonstrates a material benefit or a concrete server roadmap justifies it. The clear wins today are conventions; the urgent work is correctness and remains necessary in both stacks.
