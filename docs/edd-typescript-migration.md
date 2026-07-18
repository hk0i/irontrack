# EDD: TypeScript Migration

## Goal

Convert the remaining `.js`/`.vue` files to typed TypeScript, one file (or tightly-coupled pair) at a time, verified and committed independently — same incremental pattern as the [Vue SFC migration](edd-vue-sfc-migration.md). `db.js` → `db.ts` is done and is the template this doc generalizes from: it surfaced one real bug (Dexie's typed `transaction()` overloads cap at 5 explicit table args) that a plain JS callsite would never have caught.

## Already done

1. Scaffold: `typescript`, `vue-tsc` devDependencies, `tsconfig.json` (`allowJs: true`, `checkJs: false` — JS and TS coexist throughout, no big-bang cutover), `type-check` script (`vue-tsc --noEmit`).
2. `src/shared/db.js` → `db.ts`: `Routine`, `Exercise`, `SetEntry`, `WorkoutSession`, `MetricBlueprint`, `MetricLog` interfaces, a Dexie subclass with typed `Table<T, string>` members, every exported function given a typed signature.

## Conversion process

Repeat this per file, in the order given in Sequencing below:

1. Rename `.js` → `.ts`, or add `lang="ts"` to a `.vue` file's `<script setup>` block. Leave `<template>` untouched — `vue-tsc` infers template type-checking from the typed `<script setup>` block automatically; no mustache-syntax changes needed.
2. Replace runtime prop declarations (`defineProps({ navParams: { type: Object, default: () => ({}) } })`) with the type-only generic form (`defineProps<{ navParams?: NavParams }>()`). Only reach for `withDefaults()` where a non-trivial default is genuinely needed — for `navParams`, defaulting to `{}` inline at each access site is simpler than the `withDefaults` ceremony, so skip it.
3. Type `defineEmits` the same way, using the tuple-labeled form: `defineEmits<{ navigate: [screen: ScreenName, params?: NavParams] }>()`, replacing the current bare `['navigate']` string-array declarations.
4. Import shared interfaces (`Routine`, `Exercise`, `SetEntry`, `WeightUnit`, etc. from `db.ts`; `ScreenName`, `NavParams`, `SetRowState` from the new `shared/types.ts`) rather than re-declaring per-file duplicates.
5. Type local `ref`/`reactive`/`computed` declarations wherever TS can't infer a useful type from the initializer (`ref<Routine[]>([])`, `ref<Routine | null>(null)`). Skip the annotation wherever inference already gets it right (`ref('')` infers `Ref<string>` fine on its own).
6. Run `npm run type-check` and fix every error in that file before moving to the next file — the errors are the point of going incrementally, not a signal to batch fixes later.
7. Manually verify the screen in the dev server (`npm run dev`) — type-check only catches shape mismatches, not template/runtime logic bugs, so click through the screen's actual behavior once per file.
8. Commit each file (or a tightly-coupled pair — see `SetRow.vue` + `ActiveWorkoutScreen.vue` below) independently, so a bad conversion is a one-file `git revert`, not a tangle.

## Sequencing

Ordered so every later file can import types a config now defines, instead of duplicating shapes that get thrown away once the real thing lands:

1. `src/shared/types.ts` (new) — cross-cutting `ScreenName` / `NavParams` / `SetRowState` types every screen needs.
2. `src/vite-env.d.ts` (new) — ambient globals (`__APP_VERSION__`, `__COMMIT_HASH__`) that currently only work because nothing type-checks them yet.
3. `src/shared/store.js` → `store.ts`
4. `src/shared/common-exercises.js` → `common-exercises.ts`
5. `src/App.vue` (add `lang="ts"`)
6. `src/main.js` → `main.ts` (+ update `index.html`'s script tag)
7. `src/features/settings/SettingsScreen.vue`
8. `src/features/dashboard/DashboardScreen.vue`
9. `src/features/history/WorkoutHistoryScreen.vue`
10. `src/features/progress/ProgressChartScreen.vue`
11. `src/features/body-metrics/BodyMetricsScreen.vue`
12. `src/features/routines/RoutineBuilderScreen.vue`
13. `src/features/workout/SetRow.vue` + `src/features/workout/ActiveWorkoutScreen.vue` (converted together — they share `SetRowState` and are pointless to verify independently, since `SetRow` has no meaningful behavior outside its parent)
14. `src/sw.js` → `sw.ts` (optional, last — see risk note below)

## New shared files

### `src/shared/types.ts`

```ts
export type ScreenName =
  | 'dashboard'
  | 'settings'
  | 'routine-builder'
  | 'active-workout'
  | 'workout-history'
  | 'body-metrics'
  | 'progress-chart';

// Every screen's loose `navParams` prop, today a runtime `Object` with no
// checked shape. Both fields are optional because most screens receive an
// empty object — only RoutineBuilder/ActiveWorkout read routineId, only
// ProgressChart reads initialExerciseId.
export interface NavParams {
  routineId?: string;
  initialExerciseId?: string;
}

// The reactive per-set row object ActiveWorkoutScreen's makeEmptyRow()
// creates and SetRow.vue renders — shared because both files need the exact
// same shape and SetRow has no independent reason to define its own.
export interface SetRowState {
  weightEntered: string;
  reps: string;
  unit: import('./db').WeightUnit;
  checked: boolean;
  weightInvalid: boolean;
  repsInvalid: boolean;
  loggedSetId: string | null;
}
```

### `src/vite-env.d.ts`

`vite.config.js`'s `define` block injects `__APP_VERSION__`/`__COMMIT_HASH__` as build-time string constants — `DashboardScreen.vue` already references them today, silently untyped. Needs declaring before that file gets `lang="ts"`:

```ts
/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __COMMIT_HASH__: string;
```

## Per-file type definitions

### `src/shared/store.ts`

```ts
import type { WeightUnit, LengthUnit } from './db';

interface Settings {
  preferredUnit: WeightUnit;
  preferredLengthUnit: LengthUnit;
}
```
`settings` becomes `reactive<Settings>({...})`; `setPreferredUnit(unit: WeightUnit): void`, `setPreferredLengthUnit(unit: LengthUnit): void`. `localStorage.getItem(...)` returns `string | null` — the existing `|| 'lbs'` / `|| 'in'` fallback only guards `null`, not a corrupted stored value; cast (`as WeightUnit`) rather than add runtime validation that didn't exist before this migration.

### `src/shared/common-exercises.ts`

```ts
export const COMMON_EXERCISES: string[] = [ ... ];
```
No other types needed — a flat string list.

### `src/App.vue`

```ts
import type { Component } from 'vue';
import type { ScreenName, NavParams } from './shared/types';

const screens: Record<ScreenName, Component> = { ... };
const currentScreen = ref<ScreenName>('dashboard');
const navParams = shallowRef<NavParams>({});
function navigate(screen: ScreenName, params: NavParams = {}): void { ... }
```

### `src/main.ts`

No new types — just confirms `ensureMetricBlueprintsSeeded()`'s already-typed signature resolves cleanly through a `.ts` entry point. Remember to update `index.html`'s `<script type="module" src="/src/main.js">` → `main.ts`.

### `SettingsScreen.vue`

```ts
defineProps<{ navParams?: NavParams }>();
defineEmits<{ navigate: [screen: ScreenName, params?: NavParams] }>();
```
`importStatus: Ref<string>`, `fileInput: Ref<HTMLInputElement | null>`. `handleFileSelected(event: Event)` needs `(event.target as HTMLInputElement).files` — a plain `Event` has no `.files`. The `catch (err)` block's `err` is `unknown` under `strict`; narrow with `err instanceof Error ? err.message : String(err)` instead of the current bare `err.message`.

### `DashboardScreen.vue`

```ts
defineProps<{ navParams?: NavParams }>();
defineEmits<{ navigate: [screen: ScreenName, params?: NavParams] }>();

const routines: Ref<Routine[]> = ref([]);
const suggestedRoutine: Ref<Routine | null> = ref(null);
```
`computeSuggestedRoutine(currentRoutines: Routine[]): Promise<Routine | null>`. `APP_VERSION`/`COMMIT_HASH` resolve once `vite-env.d.ts` exists.

### `WorkoutHistoryScreen.vue`

The most type-shape-heavy screen — it builds several intermediate grouping structures inline:

```ts
import type { SetEntry, WeightUnit } from '../../shared/db';

// Transient inline-edit fields bolted onto a real SetEntry, never persisted
// as-is — startEdit()/cancelEdit() add/remove them on the object in place.
type EditableSet = SetEntry & {
  _editWeight?: string;
  _editReps?: string;
  _editUnit?: WeightUnit;
};

interface ExerciseGroup {
  name: string;
  sets: EditableSet[];
}

interface DayGroup {
  key: string;
  date: string;
  label: string;
  routineName: string | null;
  durations: string[];
  exercises: ExerciseGroup[];
}

const days: Ref<DayGroup[]> = ref([]);
const editingId: Ref<string | null> = ref(null);
```
The `onMounted` handler's local `bySession`/`legacySessionsByKey` maps get explicit generics (`Map<string, WorkoutSession[]>`, etc.) rather than inferred `any` from the object-literal accumulator pattern.

### `ProgressChartScreen.vue`

```ts
const exercises: Ref<Exercise[]> = ref([]);
const selectedExerciseId: Ref<string> = ref(props.navParams?.initialExerciseId || '');
const sets: Ref<SetEntry[]> = ref([]);
const activeModalSet: Ref<SetEntry | null> = ref(null);

interface ChartPoint {
  x: number;
  y: number;
  set: SetEntry;
}
const points: ComputedRef<ChartPoint[]> = computed(() => { ... });
```

### `BodyMetricsScreen.vue`

```ts
import type { MetricBlueprint, MetricLog, MetricType, Unit } from '../../shared/db';

const blueprints: Ref<MetricBlueprint[]> = ref([]);
const selectedBlueprintId: Ref<string> = ref('');
const recentLogs: Ref<MetricLog[]> = ref([]);
const newTrackerName: Ref<string> = ref('');
const newTrackerType: Ref<MetricType> = ref('mass');
const entryValue: Ref<string> = ref('');
const entryUnit: Ref<Unit> = ref('lbs');
const entryDate: Ref<string> = ref(todayString());
const selectedBlueprint: ComputedRef<MetricBlueprint | null> = computed(() => ... );

interface ChartPoint { x: number; y: number; }
const points: ComputedRef<ChartPoint[]> = computed(() => { ... });
```

### `RoutineBuilderScreen.vue`

```ts
import type { Exercise } from '../../shared/db';

// mergedResults mixes real Exercise rows with not-yet-created suggestions
// from COMMON_EXERCISES (id: null until the user selects one).
type ExerciseOption = Exercise | { id: null; name: string };

const editingRoutineId: Ref<string | null> = ref(props.navParams?.routineId || null);
const routineName: Ref<string> = ref('');
const searchQuery: Ref<string> = ref('');
const searchResults: Ref<Exercise[]> = ref([]);
const selectedExercises: Ref<Exercise[]> = ref([]);
const linkModeExerciseId: Ref<string | null> = ref(null);
const draggingIndex: Ref<number | null> = ref(null);
const dragOffset: Ref<number> = ref(0);
const rowEls: (HTMLElement | null)[] = [];
```
`isSelected`/`addExercise` take `exercise: ExerciseOption`. `mergedResults: ComputedRef<ExerciseOption[]>`.

### `SetRow.vue` + `ActiveWorkoutScreen.vue`

Converted together since `SetRow` only exists to serve `ActiveWorkoutScreen` and has no independent behavior to verify.

**`SetRow.vue`**
```ts
import type { SetRowState } from '../../shared/types';

defineProps<{
  row: SetRowState;
  index?: number | null;
  compact?: boolean;
}>();
defineEmits<{ 'toggle-unit': []; check: []; unlock: [] }>();
```

**`ActiveWorkoutScreen.vue`**
```ts
import type { Exercise } from '../../shared/db';
import type { SetRowState, NavParams, ScreenName } from '../../shared/types';

// Deliberately not a strict 1-or-2-length tuple — the block-building loop in
// loadWorkout() constructs these dynamically and enforcing a tuple type
// there would add generic-narrowing ceremony for no real safety gain; the
// 1-or-2 invariant stays enforced by the template's v-if on .length, same
// as today.
interface WorkoutBlock {
  exercises: Exercise[];
}

const blocks: Ref<WorkoutBlock[]> = ref([]);
const ghostTextByExercise: Record<string, string | null> = reactive({});
const setRowsByExercise: Record<string, SetRowState[]> = reactive({});
const restBannerVisible: Ref<boolean> = ref(false);
const restBannerSecondsLeft: Ref<number> = ref(REST_SECONDS);
let restInterval: ReturnType<typeof setInterval> | null = null;
const finishing: Ref<boolean> = ref(false);
```
Function signatures: `loadWorkout(): Promise<void>`, `addRow(exerciseId: string): void`, `addSupersetRow(exerciseIdA: string, exerciseIdB: string): void`, `getRow(exerciseId: string, index: number): SetRowState | undefined`, `pairedRows(block: WorkoutBlock): { index: number; rowA: SetRowState; rowB: SetRowState }[]`, `toggleUnit(row: SetRowState): void`, `checkRow(exerciseId: string, row: SetRowState, partnerRow?: SetRowState | null): Promise<void>`, `unlockRow(row: SetRowState): void`, `viewHistory(exerciseId: string): void`, `finishWorkout(): Promise<void>`.

### `sw.js` → `sw.ts` (optional, lowest priority)

Flagged separately because it's a genuinely different environment, not just a smaller version of the same conversion:

- The main `tsconfig.json`'s `lib` includes `"DOM"` for every other file's `window`/`document` globals. A service worker's `self` is `ServiceWorkerGlobalScope`, not `Window` — mixing both `DOM` and `WebWorker` libs in one tsconfig causes ambient conflicts. Doing this properly needs a **second tsconfig** (`tsconfig.sw.json`, `lib: ["ES2022", "WebWorker"]`, no `"DOM"`) excluded from the main `vue-tsc` run and checked via its own `tsc --noEmit -p tsconfig.sw.json` script.
- `self.__WB_MANIFEST` needs an ambient declaration — vite-plugin-pwa ships one via `/// <reference types="vite-plugin-pwa/client" />`, or hand-declare `declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }`.
- Unconfirmed: whether `vite-plugin-pwa`'s `injectManifest` strategy accepts a `.ts` `filename`/`srcDir` source and still emits `dist/sw.js` as output — verify against the plugin's actual behavior before renaming, rather than assuming.
- Given the file is 60 lines with no complex logic, the type-safety payoff here is the smallest of any file in this migration — fine to leave as `sw.js` indefinitely if the tsconfig-splitting cost doesn't feel worth it.

## Risks / tradeoffs

- **`WorkoutBlock.exercises` stays a loose array, not a checked 1-or-2 tuple.** The runtime invariant (standalone vs. superset pair) is still only enforced by the template's `v-if="block.exercises.length === 1"`, same as pre-migration — TypeScript won't catch a hypothetical future bug that builds a 3-exercise block. Accepted tradeoff: a stricter discriminated union is possible but adds real complexity to `loadWorkout()`'s block-building loop for a case that's never actually occurred.
- **`EditableSet`'s `_editWeight`/`_editReps`/`_editUnit` fields are still mutated in place onto real `SetEntry` objects**, not lifted into separate edit-state. TypeScript now at least documents the shape instead of leaving it fully implicit, but doesn't change the underlying "temporary fields on a persisted-looking object" pattern — a bigger refactor than this migration's scope.
- **`sw.ts` is explicitly optional** given the tsconfig-splitting cost vs. the file's size and complexity — see above.

## Out of scope

- No behavior changes anywhere in this migration — types only.
- No `MetricBlueprint` → `BodyMetric` rename (tracked separately, deliberately deferred until this migration is complete — see memory note from 2026-07-18).
- No further screen-splitting/component extraction beyond `SetRow.vue` (already done in the Vue SFC migration).
