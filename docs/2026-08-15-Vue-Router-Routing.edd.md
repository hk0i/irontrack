# EDD: Real Client-Side Routing (vue-router)

> **Date:** 2026-08-15
> **Author:** Gregory McQuillan

## Goal

irontrack has no router today. `src/App.vue` fakes screen switching with a
`ref<ScreenName>('dashboard')` + `shallowRef<NavParams>({})`, rendered via
`<component :is="screens[currentScreen]">`. Screens emit
`navigate(screen, params)` up to `App.vue`, which mutates those two refs.
There is no `history.pushState`, no `popstate` listener, no URL involvement
anywhere in `src/` (confirmed: zero hits for `URLSearchParams`,
`location.hash`, `history.push/replaceState`, `popstate` in `src/`).
Consequences, tracked as a known bug in `UP_NEXT.md` and called out as
explicitly out-of-scope in `docs/2026-08-15-Workout-History-Rework.edd.md` decision 5:

- The browser's real Back/Forward buttons do nothing useful — they leave or
  reload the SPA instead of stepping through in-app navigation.
- No deep links — no way to bookmark or share a URL to a specific workout
  session, routine editor, etc.
- "Back" inside the app is a hardcoded per-screen destination (e.g.
  `WorkoutSessionDetailScreen` always goes back to `workout-history`,
  regardless of where the user actually came from), not a real stack.

Goal: adopt `vue-router` so the URL reflects the current screen/params/query,
browser Back/Forward work correctly, and deep links work — including
offline, since this is an offline-first PWA, and across all three deploy
targets (local dev, Docker/nginx, GitHub Pages).

## Router choice

`vue-router@4.6.4` (exact pin — this repo pins every dependency without a
caret, e.g. `"vue": "3.5.39"`), added to `dependencies` (not `devDependencies`,
it's a runtime library). Not `vue-router@5` — 5.x adds `pinia: '^3.0.4 ||
^4.0.2'` and `@pinia/colada` as forced peer dependencies for its new
data-loader integration; irontrack has no state-management library today and
doesn't need one for a static 9-route table, so pulling those in would be an
unjustified footprint. 4.6.4's only peer dependency is `vue: ^3.5.0`, matching
the installed `vue@3.5.39` exactly.

`createWebHistory(import.meta.env.BASE_URL)` — real paths, not hash routing.
`import.meta.env.BASE_URL` already reflects `vite.config.js`'s existing
`base: process.env.DEPLOY_BASE || '/'` scheme (`/` locally/Docker,
`/irontrack/` on GitHub Pages), the same value `main.ts` already uses to build
the service worker's registration URL — no new env var, no drift risk between
the two.

## Architecture

```mermaid
flowchart TD
    subgraph Today["Today: fake in-memory switcher"]
        A1[Screen] -->|"emit('navigate', name, params)"| App1[App.vue]
        App1 -->|"currentScreen.value = name<br/>navParams.value = params"| App1
        App1 -->|"component :is=screens[currentScreen]"| A1
    end
    subgraph New["New: vue-router"]
        A2[Screen] -->|"router.push({ name, params, query })"| R[vue-router]
        R -->|"pushState + resolve match"| Browser[Browser history/URL]
        Browser -->|"router-view resolves Component"| App2[App.vue]
        App2 -->|"component :is=Component :key=route.fullPath"| A2
    end
```

Back-button decision logic (moves from "hardcoded per-screen destination" into
`ScreenHeader.vue` itself):

```mermaid
flowchart TD
    Click[User taps back chevron] --> Check{"window.history.state?.back set?"}
    Check -->|"yes — arrived via in-app navigation"| Back["router.back()<br/>real browser-integrated back"]
    Check -->|"no — deep-linked / cold PWA launch,<br/>nothing to pop"| Fallback["router.replace(props.fallback ?? dashboard)"]
```

## Router / component model

```mermaid
classDiagram
    class Router {
      <<vue-router>>
      +RouteRecord[] routes
      +createWebHistory(base)
      +push(location)
      +replace(location)
      +back()
    }
    class RouteRecord {
      +string path
      +string name
      +Component component
    }
    class AppVue {
      +router-view
      +RestTimerBanner
      +ToastHost
    }
    class ScreenHeader {
      +string title
      +RouteLocationRaw fallback?
      +goBack()
    }
    class FlashState {
      <<src/shared/flash-state.ts>>
      +setHighlightRoutineId(id)
      +consumeHighlightRoutineId() string?
    }
    class ScreenComponent {
      <<9 screens under src/features/**>>
      +useRoute()
      +useRouter()
    }
    Router "1" o-- "many" RouteRecord
    RouteRecord --> ScreenComponent : renders
    AppVue --> Router : renders router-view
    ScreenComponent --> ScreenHeader : mounts, passes fallback
    ScreenHeader --> Router : back() / replace()
    ScreenComponent --> Router : push() on navigation
    ScreenComponent ..> FlashState : Dashboard consumes,\nRoutineBuilder sets
```

`ScreenName`/`NavParams` (today's ad-hoc, unchecked-shape types in
`src/shared/types.ts`) are deleted once every screen is converted — `RouteRecord`
names and typed `route.params`/`route.query` reads replace them.

## Route table

| Screen | Route | Params |
|---|---|---|
| dashboard | `/` | — |
| settings | `/settings` | — |
| routine-builder (create) | `/routines/new` — route name `routine-builder-new` | — |
| routine-builder (edit) | `/routines/:routineId/edit` — route name `routine-builder-edit` | path |
| share-routines | `/share-routines` | — |
| active-workout | `/workout/:routineId` | path |
| workout-history | `/history` | — |
| workout-session-detail | `/history/:sessionId` (route `workout-session-detail`) | required path |
| workout-session-detail (legacy) | `/history/legacy/:sessionDate/:routineId?` (route `workout-session-detail-legacy`) | path (`routineId` param `'none'` when null — no path param can be `undefined`) |
| body-metrics | `/body-metrics` | — |
| progress-chart | `/progress` | optional `?exerciseId=` query |

Plus a catch-all: `{ path: '/:pathMatch(.*)*', redirect: { name: 'dashboard' } }`.

`routine-builder` create/edit are two named routes onto the same component —
idiomatic vue-router, avoids an awkward optional-param-with-fixed-suffix path.
`progress-chart`'s exercise id is a query param, not a path param — the
screen already treats it as a mutable initial selection
(`ref(props.navParams?.initialExerciseId || '')`), not a canonical resource
identity.

**`highlightRoutineId` stays out of the URL.** It's a one-shot "jiggle this
card" animation cue (`DashboardScreen`, triggered after `RoutineBuilderScreen`
saves), not identity/resource state — a query string would leave a stale
fragment that wrongly re-triggers the animation if the dashboard URL is
bookmarked or reopened later. New tiny module instead:

```ts
// src/shared/flash-state.ts
import { ref } from 'vue';

const pendingHighlightRoutineId = ref<string | null>(null);

export function setHighlightRoutineId(id: string): void {
  pendingHighlightRoutineId.value = id;
}

export function consumeHighlightRoutineId(): string | null {
  const id = pendingHighlightRoutineId.value;
  pendingHighlightRoutineId.value = null;
  return id;
}
```

Plain in-memory `ref` is sufficient (no `sessionStorage`) — this is always a
same-runtime SPA navigation, never a full page reload, exactly like today's
equally in-memory `shallowRef<NavParams>`.

## Changes

### 1. `src/router/index.ts` (new)

```ts
import { createRouter, createWebHistory } from 'vue-router';
import DashboardScreen from '../features/dashboard/DashboardScreen.vue';
// ...one import per screen, matching App.vue's existing import list

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardScreen },
    { path: '/settings', name: 'settings', component: SettingsScreen },
    { path: '/routines/new', name: 'routine-builder-new', component: RoutineBuilderScreen },
    { path: '/routines/:routineId/edit', name: 'routine-builder-edit', component: RoutineBuilderScreen },
    { path: '/share-routines', name: 'share-routines', component: ShareRoutinesScreen },
    { path: '/workout/:routineId', name: 'active-workout', component: ActiveWorkoutScreen },
    { path: '/history', name: 'workout-history', component: WorkoutHistoryScreen },
    // Legacy path registered before the real-session path — see the third
    // correction below for why an optional param here is unsafe.
    { path: '/history/legacy/:sessionDate/:routineId?', name: 'workout-session-detail-legacy', component: WorkoutSessionDetailScreen },
    { path: '/history/:sessionId', name: 'workout-session-detail', component: WorkoutSessionDetailScreen },
    { path: '/body-metrics', name: 'body-metrics', component: BodyMetricsScreen },
    { path: '/progress', name: 'progress-chart', component: ProgressChartScreen },
    { path: '/:pathMatch(.*)*', redirect: { name: 'dashboard' } },
  ],
});
```

### 2. `src/main.ts`

```ts
import { router } from './router';
// ...
await ensureMetricBlueprintsSeeded();
const app = createApp(App);
app.use(router);
await router.isReady(); // resolve initial route (incl. deep link) before mount
app.mount('#app');
```

### 3. `src/shared/flash-state.ts` (new)

As shown above.

### 4. `src/shared/components/ScreenHeader.vue`

```vue
<script setup lang="ts">
import { useRouter, type RouteLocationRaw } from 'vue-router';
import IconButton from './IconButton.vue';

const props = defineProps<{ title: string; fallback?: RouteLocationRaw }>();
const router = useRouter();

function goBack(): void {
  // history.state.back is set by vue-router's HTML5 history on every push;
  // null only on a fresh/deep-linked load with no in-app predecessor.
  if (window.history.state?.back) {
    router.back();
  } else {
    router.replace(props.fallback ?? { name: 'dashboard' });
  }
}
</script>

<template>
  <header class="...">
    <IconButton @click="goBack" aria-label="Back"> ... </IconButton>
    <h1 class="text-lg font-bold">{{ title }}</h1>
  </header>
</template>
```

The `back` emit is deleted — every parent screen's `@back="emit('navigate', X)"`
binding is removed too (see per-screen changes below).

### 5. `src/App.vue`

```vue
<script setup lang="ts">
import { RouterView } from 'vue-router';
import RestTimerBanner from './shared/components/RestTimerBanner.vue';
import ToastHost from './shared/components/ToastHost.vue';
</script>

<template>
  <router-view v-slot="{ Component, route }">
    <component :is="Component" :key="route.fullPath" />
  </router-view>
  <RestTimerBanner />
  <ToastHost />
</template>
```

The `screens` lookup, `ScreenName`/`NavParams` imports, `currentScreen`/
`navParams` refs, and `navigate()` are all deleted. `RestTimerBanner`/
`ToastHost` are unchanged — already siblings outside the switched component.

**`:key="route.fullPath"` is load-bearing, not decoration.** By default
`<router-view>` reuses the same component instance across navigations to the
same route record even when only a path param changes (e.g. editing routine A
then routine B would not remount `RoutineBuilderScreen`). Every screen reads
its params once at setup time today — safe only because the old
`<component :is>` fully unmounted/remounted on every navigation. Keying on
`route.fullPath` preserves that guarantee, so no screen needs to be rewritten
to reactively watch `route.params`.

### 6. Per-screen conversions (all 9 screens under `src/features/**`)

**Scoped down from the original version of this doc** (see the correction
under Sequencing below): `defineEmits<{ navigate: [...] }>()` is *not*
deleted in this per-screen step. Every screen with a `ScreenHeader` still
has a live `@back="emit('navigate', X)"` binding driving `App.vue`'s old
switcher — that's the only thing making the back button work until the
cutover step, so it stays untouched here. This step converts only: (a) the
unused `navParams` prop, if the screen doesn't read it — dropped; (b)
`props.navParams?.x` reads the screen *does* use — replaced with
`useRoute()` param/query reads; (c) **forward** `emit('navigate', ...)`
call sites (i.e. everything except `@back`) — replaced with
`useRouter().push(...)`. Pattern (shown for `ActiveWorkoutScreen.vue`):

```ts
// before
const props = defineProps<{ navParams?: NavParams }>();
const emit = defineEmits<{ navigate: [screen: ScreenName, params?: NavParams] }>();
const routineId = props.navParams?.routineId || null;
// ...
emit('navigate', 'dashboard'); // finish/cancel
emit('navigate', 'progress-chart', { initialExerciseId: exerciseId });

// after
import { useRoute, useRouter } from 'vue-router';
const route = useRoute();
const router = useRouter();
const routineId = (route.params.routineId as string) || null;
// ...
router.push({ name: 'dashboard' }); // finish/cancel
router.push({ name: 'progress-chart', query: { exerciseId } });
// @back="emit('navigate', 'dashboard')" on <ScreenHeader> is UNCHANGED —
// emit/defineEmits/ScreenName/NavParams imports all stay for this reason.
```

These forward `router.push` calls have no visible effect yet (`App.vue`
still renders the old switcher) — that's the accepted, bounded gap described
in Sequencing. The back button, unlike forward nav, is unaffected during
this whole stretch, precisely because `@back` is left alone.

**Second correction (found during implementation, same root cause as the
`ScreenHeader` one):** a *receiving* screen's param read cannot simply switch
from `props.navParams?.x` to `route.query`/`route.params` on its own step if
its **sender** converts on a *later* step — the sender is still emitting via
the old `navParams`-prop mechanism until its own step lands, so the receiver
would silently stop getting the value in between (e.g. "jump to this
exercise's progress chart" quietly resets to the first exercise instead).
Any receiver whose step number is earlier than its sender's needs a
**dual read** for the duration of the gap: `props.navParams?.x ??
(route.query/params.x as string)`, with a comment noting it's temporary and
removed at the cutover step once every sender has converted. This applies to:
`ProgressChartScreen` (sender: `ActiveWorkoutScreen`, converts later),
`WorkoutSessionDetailScreen` (sender: `WorkoutHistoryScreen`, converts one
step later), and `ActiveWorkoutScreen` + `RoutineBuilderScreen` (sender for
both: `DashboardScreen`, converted last of all nine). Screens with no
incoming param (`BodyMetricsScreen`, `ShareRoutinesScreen`,
`SettingsScreen`, `WorkoutHistoryScreen`) aren't affected.

Full per-screen mapping:

| Screen | Param reads | Forward navigation calls converted | `@back` |
|---|---|---|---|
| `BodyMetricsScreen.vue` | none used | none — only has `@back` | unchanged |
| `ProgressChartScreen.vue` | `route.query.exerciseId as string \|\| ''` | none — only has `@back` | unchanged |
| `ShareRoutinesScreen.vue` | none used | none — only has `@back` | unchanged; `:fallback` prop added at cutover, not here |
| `SettingsScreen.vue` | none used | `router.push({ name: 'share-routines' })` | unchanged |
| `WorkoutSessionDetailScreen.vue` | `route.params.sessionId`; legacy `route.params.sessionDate`/`routineId` (route `workout-session-detail-legacy`) | none — only has `@back` | unchanged; `:fallback` prop added at cutover, not here |
| `WorkoutHistoryScreen.vue` | none used | `openDetail()` → `router.push({ name: 'workout-session-detail', params: { sessionId } })` or `{ name: 'workout-session-detail-legacy', params: { sessionDate, routineId: routineId \|\| 'none' } }` legacy | unchanged |
| `ActiveWorkoutScreen.vue` | `route.params.routineId` | finish/cancel → dashboard; exercise link → progress-chart with `exerciseId` query | unchanged |
| `RoutineBuilderScreen.vue` | `route.params.routineId` (edit) / none (create, `routine-builder-new`) | save calls `setHighlightRoutineId(id)` then `router.push({ name: 'dashboard' })` | unchanged |
| `DashboardScreen.vue` | `consumeHighlightRoutineId()` replaces `navParams.highlightRoutineId` | every non-back `emit('navigate', ...)` call site converts to `router.push({ name, params/query })` | n/a — no `ScreenHeader` on the home screen |

`ScreenName`/`NavParams` imports and `defineEmits` are deleted for real, and
every `@back` binding removed, only in step 13 (the combined cutover step),
once `App.vue` renders `<router-view>` and `ScreenHeader` no longer needs
the old emit to make back navigation visible.

### 7. `src/shared/types.ts`

`ScreenName` and `NavParams` deleted (final cleanup step, after every screen
is converted).

## Deploy fallback fixes

Real paths mean any deep link (`/history/<id>`, a refresh, a PWA cold
launch) must resolve to `index.html` so the router can boot and match
client-side. Three targets need this, plus the service worker for offline —
required, not optional, for an offline-first PWA:

1. **Docker/nginx** — no `nginx.conf` exists today; the stock `nginx:alpine`
   image's default config does `try_files $uri $uri/ =404`, which 404s any
   deep-linked path. New `nginx.conf`:
   ```nginx
   server {
       listen 80;
       server_name _;
       root /usr/share/nginx/html;
       index index.html;
       location / {
           try_files $uri $uri/ /index.html;
       }
   }
   ```
   `Dockerfile` adds `COPY nginx.conf /etc/nginx/conf.d/default.conf` after
   the `dist/` copy.

2. **GitHub Pages** — static hosting, no server rewrites possible. Since
   `base: '/irontrack/'` bakes absolute asset URLs into `index.html` at build
   time, a plain copy works as the SPA fallback:
   ```yaml
   - name: Add SPA fallback 404.html
     run: cp dist/index.html dist/404.html
   ```
   added to `.github/workflows/deploy-pages.yml` between "Build" and
   "Upload dist/ as Pages artifact". GH Pages serves this body as an HTTP 404
   (harmless — browsers render the body regardless of status on a top-level
   navigation) while leaving the address bar at the real deep path, so
   vue-router matches correctly once it boots.

3. **Service worker (`src/sw.js`)** — deep-link paths are never themselves
   precached (only hashed asset URLs from `self.__WB_MANIFEST` are). Offline
   + direct navigation to one currently hard-fails once the network fetch
   rejects. Extend the existing catch:
   ```js
   // before
   .catch(() => caches.match(event.request))

   // after
   .catch(() =>
     caches.match(event.request).then((cached) => {
       if (cached) return cached;
       if (event.request.mode === 'navigate') {
         return caches.match(`${self.registration.scope}index.html`);
       }
       return undefined;
     })
   )
   ```
   `self.registration.scope` is already base-aware (`main.ts` registers via
   `` `${import.meta.env.BASE_URL}sw.js` ``), so this automatically matches
   the manifest's own URL scheme in every deploy target. No change to the
   existing update-flow logic (`skipWaiting`/`SKIP_WAITING` message/
   `CACHE_NAME` hashing) — only the fetch handler's catch path. Must confirm
   `index.html` is actually present in the precache manifest at
   implementation time (add via `includeAssets`/`globPatterns` in the
   `VitePWA()` config in `vite.config.js` if it's missing).

4. **Vite dev server** — already has built-in SPA fallback, no action needed.

## Out of scope

- `vue-router@5` / Pinia adoption — no current need for a data-loader layer.
- Route-level code splitting / lazy `() => import(...)` component loading —
  9 screens is small; can be added later without touching the route table
  shape.
- Route transition animations.
- Rewriting any screen's internals beyond the prop/emit → route param/push
  swap described above.

## Sequencing

Atomic, independently-committable steps; `npm run type-check` must pass clean
at every stop, per this project's CLAUDE.md:

1. This doc — no code changes.
2. Add `vue-router@4.6.4` to `package.json`. Create `src/router/index.ts`
   with the full route table + catch-all; register in `main.ts`
   (`app.use(router)`, `await router.isReady()` before `.mount()`).
   `App.vue`'s template is untouched — router exists but nothing renders
   `<router-view>` yet, so behavior is unchanged.
3. Add `src/shared/flash-state.ts` — new, unused until steps 9/10.
4. `BodyMetricsScreen.vue` conversion.
5. `ProgressChartScreen.vue` conversion.
6. `ShareRoutinesScreen.vue` conversion. Do **not** add a `:fallback` prop to
   `ScreenHeader` yet — it doesn't support one until step 13 (see correction
   below). Keep the existing `@back="emit('navigate', 'settings')"` binding
   for now.
7. `SettingsScreen.vue` conversion.
8. `WorkoutSessionDetailScreen.vue` conversion. Same note as step 6 — keep
   `@back="emit('navigate', 'workout-history')"` for now.
9. `WorkoutHistoryScreen.vue` conversion.
10. `ActiveWorkoutScreen.vue` conversion.
11. `RoutineBuilderScreen.vue` conversion.
12. `DashboardScreen.vue` conversion (most call sites, do last of the nine).

    Note: steps 4–12 are individually buildable/typecheck-clean, but full
    click-through correctness has a transient gap during this run (`App.vue`
    still drives the old switcher, so a converted screen's `router.push`
    updates the URL/router state without the switcher reacting) — bounded to
    this contiguous stretch, closed at step 13. The **back** button is
    unaffected during this stretch — `ScreenHeader.vue` is untouched until
    step 13, so every screen's existing `@back` binding keeps working
    exactly as before.

13. **`App.vue` cutover, combined with the `ScreenHeader.vue` back-button
    rewrite.** These must land in the same step, not two — see the
    correction below for why. Swap `App.vue` to `<router-view>`; rewrite
    `ScreenHeader.vue`'s back button to the `useRouter()` +
    `history.state.back` + `fallback` prop design; add
    `:fallback="{ name: 'settings' }"` to `ShareRoutinesScreen.vue` and
    `:fallback="{ name: 'workout-history' }"` to
    `WorkoutSessionDetailScreen.vue`; remove the now-dead `@back="emit(...)"`
    bindings everywhere. Single highest-risk step; full click-through
    correctness (forward nav *and* back button) is restored here. Manually
    smoke-test every navigation path (all 9 screens, back button on each,
    deep-link a session detail URL directly, browser Back/Forward).
14. Docker/nginx SPA fallback (`nginx.conf` + `Dockerfile`).
15. GitHub Pages `404.html` step in `deploy-pages.yml`.
16. Service worker navigation fallback (`sw.js` fetch-handler diff).
17. Cleanup: delete `ScreenName`/`NavParams` from `src/shared/types.ts`; grep
    repo-wide for `navParams`/`ScreenName`/`emit('navigate'` to confirm
    nothing remains.

Steps 14–16 have no dependency on 1–13 and could be reordered earlier or
done in parallel — placed last since they're only meaningful once real
routes exist to protect.

### Correction (found during implementation)

The original version of this doc scheduled the `ScreenHeader.vue` rewrite as
its own early step (old step 4), before any screen was converted, on the
theory that it would be a visible no-op since nothing passed `fallback` yet
and the stale `@back` bindings would just become "inert unconsumed
listeners." **That reasoning was wrong and the mistake was caught by manual
testing after that step landed:** the old back button worked by
`ScreenHeader` *emitting* a `back` event that each parent screen's `@back`
listener turned into `emit('navigate', target)`, which is what drove
`App.vue`'s old switcher. The rewritten `ScreenHeader` doesn't emit anything
— it calls `router.back()`/`router.replace()` directly. Since `App.vue`
still rendered the old switcher (not `<router-view>`) at that point, those
router calls had zero visible effect, and the parent's old `@back` handler
never fired anymore — so the back button did nothing, for every screen, the
moment that step landed. It was reverted, and the rewrite is now folded into
the `App.vue` cutover step (13), the only point at which `router.back()`
being visible and the old `@back` emit chain being safe to delete are both
true simultaneously.

### Second correction (found during manual testing after step 13)

The original route table used `/history/:sessionId?` — an *optional* path
param — reasoning that it would cleanly mirror the existing prop-read
fallback logic (`sessionId ?? (sessionDate + routineId)`). This was wrong in
a way `npm run type-check`/`build` couldn't catch: an optional param makes
the route also match the *parent* path with the param simply absent, so
`/history/:sessionId?` matches bare `/history` too — the exact same URL the
static `workout-history` route owns. Resolving a route by name
(`router.push({ name })`, used for all forward navigation here) sidesteps
this, which is why it wasn't caught until manual back-button testing: POP
navigation (`router.back()`/the browser's real Back button) resolves by
**URL**, not by name, and vue-router matched the ambiguous `/history` against
`workout-session-detail` instead of `workout-history`. The user-visible
symptom: back from a session detail screen landed on `WorkoutSessionDetailScreen`
with no `sessionId`, rendering its own empty state — which read as "Workout
History has no history," not as "wrong screen entirely." Verified both the
bug and the fix directly against the `vue-router` matcher via a standalone
Node script calling `router.resolve('/history')`, rather than reasoning about
matcher-priority rules abstractly.

Fix: split the legacy fallback out of the optional-param slot into its own
distinct, non-overlapping path — `/history/legacy/:sessionDate/:routineId?`
(a literal `legacy` segment makes it unambiguous with `/history/:sessionId`
at the routing level; path params can't be `undefined`, so `routineId` is
encoded as the literal string `'none'` when null, mirroring
`WorkoutHistoryScreen`'s own existing `` `${routineId || 'none'}` `` legacy
grouping key). The legacy fields moved from query params to path params as
part of this fix. The Route table, the `src/router/index.ts` snippet, and the
per-screen mapping table above all reflect the corrected two-route design,
not the original single-optional-param one.

## Verification

- `npm run type-check` after each step.
- `npm run dev`, manually click through every screen + back button + browser
  Back/Forward buttons after step 14.
- `npm run build && npm run preview`, load a deep link (e.g.
  `/history/<real-session-id>`) directly, then test offline reload after
  step 17 (DevTools → Offline → reload).
- `docker build .` + curl a deep path after step 15.
- Inspect `dist/404.html` exists and matches `dist/index.html` after step 16.
