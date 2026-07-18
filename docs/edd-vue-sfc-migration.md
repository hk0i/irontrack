# EDD: Migrate to Vue SFCs + Vite Build

## Goal

Replace the current giant-template-literal component format with real Vue Single File Components (`.vue`), introducing the minimum build tooling required to compile them, and reorganize the codebase by feature/scenario instead of a flat `components/` folder. This is a deliberate departure from the project's original zero-build constraint — the tradeoff being made here is build-tool complexity in exchange for readable, maintainable component files.

## Current state

Every screen is a plain JS object passed a template string:

```js
export default {
  props: { ... },
  setup(props, { emit }) { ... },
  template: `<div class="...">...huge block of markup...</div>`,
};
```

No bundler is involved anywhere — Vue, Dexie, and Tailwind are loaded as global `<script>` tags (vendored into `www/vendor/` by `scripts/vendor.mjs`), and app code is native ES modules referencing `window.Vue` / `window.Dexie`. `scripts/dev-server.mjs` is a hand-rolled static file server. Deployment (GitHub Pages and Docker) both ship `www/` as-is — no build step exists anywhere in the pipeline.

Current sizes, for scale:

| File | Lines |
|---|---|
| `components/active-workout.js` | 457 |
| `db.js` | 360 |
| `components/routine-builder.js` | 303 |
| `components/workout-history.js` | 277 |
| `components/body-metrics.js` | 241 |
| `components/dashboard.js` | 160 |
| `components/progress-chart.js` | 125 |
| `components/settings.js` | 105 |

`active-workout.js` is the worst offender — its template has near-identical weight/unit/reps/checkmark markup repeated three times (standalone row, superset row A, superset row B), which is exactly the kind of duplication a real component (`<SetRow>`) would collapse into one place. Several changes this session (row reorder, checkbox removal, edit-toggle) each had to touch that markup three times for exactly this reason.

## Target architecture

**Build tool: Vite.** It's the de facto standard for Vue 3, has first-class `@vitejs/plugin-vue` SFC support, a fast dev server with real HMR, and an official Tailwind v4 plugin (`@tailwindcss/vite`) that replaces the current runtime-JIT `@tailwindcss/browser` with build-time compiled CSS — a straight upgrade, not just a lateral move, since it drops the `MutationObserver`-based DOM rescanning entirely.

**File layout, organized by scenario:**

```
irontrack/
  index.html                     # Vite convention: lives at project root now
  vite.config.js
  package.json
  src/
    main.js                      # createApp(App).mount('#app'), SW registration
    App.vue                      # screen-switching root (unchanged logic, just .vue)
    shared/
      db.js                      # unchanged data layer, real `import Dexie from 'dexie'`
      store.js                   # unchanged reactive settings singleton
      common-exercises.js
    features/
      dashboard/
        DashboardScreen.vue
      routines/
        RoutineBuilderScreen.vue
      workout/
        ActiveWorkoutScreen.vue
        SetRow.vue                # extracted: weight/unit/reps/checkmark, used by both
                                   # the standalone and superset-pair cases
        RestBanner.vue
      history/
        WorkoutHistoryScreen.vue
      progress/
        ProgressChartScreen.vue
      body-metrics/
        BodyMetricsScreen.vue
      settings/
        SettingsScreen.vue
  public/
    manifest.json
    icons/
  dist/                          # generated, gitignored — the actual deploy artifact
```

`components/` (flat, generic) becomes `features/<scenario>/` (grouped by what the user is doing) — `shared/` is deliberately not a "scenario," it's cross-cutting data/state that every feature depends on.

**Component format**, e.g. `DashboardScreen.vue`:
```vue
<script setup>
import { ref, onMounted } from 'vue';
import { getAllRoutines, deleteRoutine, getAllSets } from '../../shared/db.js';
// ...
</script>

<template>
  <div class="min-h-screen bg-slate-950 ...">
    ...
  </div>
</template>
```
`<script setup>` over Options API — matches the `setup()` style already used everywhere, so the conversion is close to mechanical: lift the template string into a `<template>` block (no syntax translation needed, Vue mustache syntax is unchanged), replace `Vue.ref`/`Vue.reactive`/`Vue.onMounted` globals with real named imports, drop the `return {...}` block since `<script setup>` auto-exposes top-level bindings to the template.

**Version/commit stamping** (`version.js` / `commit.js`) goes away as files — becomes `vite.config.js` `define` constants (`__APP_VERSION__` from `package.json`, `__COMMIT_HASH__` from `git rev-parse --short HEAD`, run at build time), injected directly into the bundle. Same underlying idea as today (compute at build/deploy time, never bake into a tracked source file), just Vite's native mechanism instead of a generated `.js` file.

**Service worker**: replace the hand-maintained `ASSET_LIST` with `vite-plugin-pwa` in `injectManifest` mode — this keeps your existing custom `sw.js` fetch handler (the network-first strategy is a deliberate, already-tuned decision, not something to hand off to generic Workbox strategies) but auto-generates the precache manifest from the real build output. This directly kills the recurring "forgot to bump `CACHE_NAME` / add a new file to `ASSET_LIST`" problem that came up repeatedly this session.

**What's removed:** `scripts/vendor.mjs`, `scripts/dev-server.mjs`, `www/vendor/*.js` — Vite resolves `vue`/`dexie` from `node_modules` directly, no vendoring step needed.

**What's unchanged:** the data layer's API surface (`db.js`), the screen-switching approach (no router library — 7 screens with simple linear navigation doesn't need one), the `store.js` singleton pattern (no Pinia), IndexedDB schema, and all product behavior. This is a tooling and file-organization change only.

## Deployment changes

**GitHub Pages** (`.github/workflows/deploy-pages.yml`): add a Node setup + `npm ci` + `npm run build` step before the upload; upload `dist/` instead of `www/`. The commit-hash stamping step goes away — it's now a `vite.config.js` `define`, computed automatically on every build.

**Docker**: the `Dockerfile` gains a `node:alpine` build stage (`npm ci && npm run build`) before the `nginx:alpine` stage, which copies `dist/` instead of `www/`. The existing `gitinfo` stage (added for commit-hash stamping) can likely be folded into this same Node stage, since Vite's `define` can shell out to git directly during `vite build` — one build stage instead of two. `docker compose up --build` keeps working with zero extra flags, same as today.

## Migration sequencing

Proposed as separate, independently-committable steps, same pattern as the rest of this project:

1. **Scaffold**: `vite.config.js`, move `index.html` to root, `package.json` gets `vite`, `@vitejs/plugin-vue`, `@tailwindcss/vite` as devDependencies and `dev`/`build`/`preview` scripts. Nothing converted yet — app still runs exactly as today via the old files, just proves Vite boots.
2. **Shared layer**: move `db.js`, `store.js`, `common-exercises.js` into `src/shared/`, swap `window.Dexie` for a real `import Dexie from 'dexie'`. No behavior change, pure relocation + import-style swap.
3. **One screen as a proof of concept** — probably `settings.js` (smallest, 105 lines, no complex child markup) — converted to `SettingsScreen.vue`, wired into a minimal `App.vue`, verified end-to-end (dev server, then a real `vite build` + preview) before touching anything bigger.
4. **Remaining screens**, one or two at a time, into their `features/<scenario>/` folders.
5. **Extract `active-workout.js`'s duplicated row markup** into `SetRow.vue` while converting it — the highest-value single piece of this migration, given how many recent changes had to touch that markup three times.
6. **PWA tooling swap**: `vite-plugin-pwa` in `injectManifest` mode, keeping the existing network-first `sw.js` logic; remove `scripts/vendor.mjs`, `scripts/dev-server.mjs`, `www/vendor/`.
7. **CI + Docker**: update the Pages workflow and Dockerfile as described above.
8. **Cleanup**: update README's dev-setup instructions to match the new `npm run dev` / `npm run build` workflow.

## Tradeoffs / risks

- **This explicitly abandons the original zero-build constraint.** Worth stating plainly since it was a deliberate early decision — this EDD is a conscious reversal of it, not an accidental scope creep.
- **New dependency surface**: Vite, `@vitejs/plugin-vue`, `vite-plugin-pwa`, `@tailwindcss/vite` become real build-time dependencies — bigger `node_modules`, more supply-chain surface, and Node becomes required to produce a deployable build (it's already required today for `npm run vendor`/`npm run dev`, so this raises the bar rather than introducing a wholly new requirement).
- **CI/Docker build times increase modestly** — a real bundle/minify step replaces what's currently a raw file copy. For an app this size, expected to still be well under a minute.
- **Migration effort is mechanically low-risk**: template content doesn't need logic changes, only relocation from a JS string into a `<template>` block, and `Vue.x` globals become named imports. The main place for actual bugs to creep in is the `active-workout.js` extraction (step 5), since that's the one step that changes structure, not just format — worth extra manual verification when it happens.

## Out of scope

- No router library — the existing hand-rolled `navigate(screen, params)` + `<component :is>` approach stays.
- No state management library (Pinia) — `store.js`'s tiny reactive singleton is sufficient and stays as-is.
- No UI/UX or data-model changes of any kind — this is a pure tooling and file-organization refactor.
