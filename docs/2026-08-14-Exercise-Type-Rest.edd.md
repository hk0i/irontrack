# EDD: Exercise-Type-Based Rest Timers (Warmup vs Regular)

| | |
|---|---|
| **Date** | 2026-08-14 |
| **Author** | Gregory McQuillan |

## Goal

Rest timer today: one hardcoded constant, `REST_SECONDS = 90` (`ActiveWorkoutScreen.vue:40`), applied uniformly to every checked set regardless of exercise. Discovered as a real problem in the user's own workouts — warmups (cat/cow, arm circles, scapular wall raises) were taking 7–10 minutes because trivial mobility drills got the same 90s rest as heavy compound lifts, working against efficient gym time. `UP_NEXT.md` already lists this exact gap as planned backlog.

`rest-timer.ts` (`startRestTimer(seconds)`), `rest-alert.ts`, and `RestTimerBanner.vue` are all duration-agnostic already — they take/display whatever seconds value they're given and have zero knowledge of exercise identity. So the entire fix is upstream: tag each exercise with a type, make the per-type duration configurable, and resolve the right number at the one call site that starts the timer (`ActiveWorkoutScreen.vue`'s `checkRow`).

Decisions locked in with the user, not re-litigated here:
1. Exactly two exercise types for v1: `warmup` and `regular`.
2. Durations are two **global** defaults, set in Settings — not a per-exercise override. Simplest version of "customizable" that solves the actual problem.
3. Superset pairs can mix a warmup + regular exercise (`Exercise.supersetWith` links are global/unscoped, not type-restricted, so this isn't preventable without a separate new validation rule). When mixed, rest = `Math.max()` of the two type defaults, so the regular side never gets shortchanged.

## Data model

`Exercise.exerciseType?: ExerciseType` (`db.ts:40-50`), additive optional field — no `.version()` bump, same precedent as `resistanceType` (`db.ts` comment at lines 44-49) and `Routine.sortOrder`. Existing exercises have no key at all; every read site falls back to `'regular'` explicitly (the prior implicit flat-90s behavior) rather than treating absence as `'warmup'`.

```ts
export type ExerciseType = 'warmup' | 'regular';

export const EXERCISE_TYPES: { value: ExerciseType; label: string }[] = [
  { value: 'regular', label: 'Regular' },
  { value: 'warmup', label: 'Warmup' },
];
```

`createExercise` (`db.ts:275-286`) takes `exerciseType = 'regular'`, mirroring the existing `resistanceType = 'weight'` default param.

`store.ts`'s `Settings` gains two numbers, following the exact `preferredUnit` pattern (`STORAGE_KEY` const + localStorage-backed initializer with fallback + `setX()` writing both the reactive field and storage):

```ts
warmupRestSeconds: number;   // default 30
regularRestSeconds: number;  // default 90 — matches today's flat REST_SECONDS, so existing users see zero behavior change until they visit Settings
```

```ts
function loadRestSeconds(key: string, fallback: number): number {
  const stored = Number(localStorage.getItem(key));
  return Number.isFinite(stored) && stored > 0 ? stored : fallback;
}
```
(`Number(null)` is `0`, so the `> 0` guard also covers "key was never set", not just corrupt values.)

## Changes

### 1. `src/shared/db.ts`
- `ExerciseType`, `EXERCISE_TYPES` — placed next to `ResistanceType`/`RESISTANCE_TYPES` (`db.ts:16-28`).
- `Exercise.exerciseType?: ExerciseType`.
- `createExercise` gains the `exerciseType = 'regular'` param and stores it.

### 2. `src/shared/store.ts`
- `warmupRestSeconds` / `regularRestSeconds` on `Settings`, `loadRestSeconds()` helper, `setWarmupRestSeconds()` / `setRegularRestSeconds()` setters — same shape as `setPreferredUnit`.

### 3. `src/features/settings/SettingsScreen.vue`
- Two `<input type="number" min="0" step="5">` fields inserted after the "Preferred weight unit" section (`SettingsScreen.vue:84-88`), matching the screen's existing label + control + helper-`<p>` shell, wired to the step-2 setters via `@change`.

### 4. `src/features/routines/RoutineBuilderScreen.vue`
- `newExerciseType = ref<ExerciseType>('regular')` beside `newExerciseResistanceType` (`RoutineBuilderScreen.vue:48-53`); a `SegmentedToggle :options="EXERCISE_TYPES"` in the creation panel beside the existing resistance-type toggle (`RoutineBuilderScreen.vue:191-194`); threaded through both `addExercise`/`createAndAddExercise` (`RoutineBuilderScreen.vue:97-113`).
- `setExerciseType(exercise, value)` handler + a per-row `<select>` beside the existing resistance-type cycler (`RoutineBuilderScreen.vue:246-253`), same `updateExercise(id, { exerciseType })` pattern as `setResistanceType`.
- Each exercise row already packs drag handle / name / resistance select / link button / remove button — a 6th control may crowd narrow phone widths. Ship matching the existing pattern; check visually in-browser during this step and adjust spacing only if actually cramped (CSS-only concern, not an architecture one).

### 5. `src/features/workout/ActiveWorkoutScreen.vue`
Remove `const REST_SECONDS = 90;` (line 40). Add three functions near `pairedRows()` (`ActiveWorkoutScreen.vue:294-301`), just above `checkRow`:

```ts
function restSecondsForExercise(exercise: Exercise): number {
  return exercise.exerciseType === 'warmup' ? settings.warmupRestSeconds : settings.regularRestSeconds;
}

function restSecondsForBlock(block: WorkoutBlock): number {
  return Math.max(...block.exercises.map(restSecondsForExercise));
}

function findBlockForExercise(exerciseId: string): WorkoutBlock | undefined {
  return blocks.value.find((block) => block.exercises.some((e) => e.id === exerciseId));
}
```

`checkRow`'s trigger (`ActiveWorkoutScreen.vue:356-358`) becomes:

```ts
if (!isEdit && (!partnerRow || partnerRow.checked)) {
  const block = findBlockForExercise(exerciseId);
  startRestTimer(block ? restSecondsForBlock(block) : settings.regularRestSeconds);
}
```

Minimal diff — `checkRow`'s signature and all call sites untouched; `settings` already imported here (`ActiveWorkoutScreen.vue:25`).

## Out of scope for v1

Per-exercise rest override (beyond the type default). More than two exercise types. Restricting `setSupersetLink` to same-type pairs — mixed pairs are allowed and handled via `Math.max()` instead.

## Known limitation, accepted for v1

`ActiveWorkoutScreen.vue` has a second, independent exercise-creation surface — the ad-hoc "+ Add exercise" panel opened mid-workout, with its own `newExerciseResistanceType`/`RESISTANCE_TYPES` toggle. Left as-is in this EDD's scope, anything added ad-hoc mid-workout defaults to `regular` even if it's obviously a warmup. Not a data loss risk (exercises are global records — mistagged ones are fixable anytime via RoutineBuilderScreen's per-row editor), so deferred rather than bundled in; can be a same-shape one-file follow-up (mirror the `EXERCISE_TYPES` toggle into that panel) if it proves annoying in practice.

## Sequencing

Atomic, independently-committable, `vue-tsc --noEmit` passing at every stop (repo has no test suite beyond type-checking):

1. This doc (`docs/2026-08-14-Exercise-Type-Rest.edd.md`) — no code changes.
2. `src/shared/db.ts` — `ExerciseType`, `EXERCISE_TYPES`, `Exercise.exerciseType?`, `createExercise` param. No callers pass it yet.
3. `src/shared/store.ts` — the two new settings fields + setters. Unused by any screen yet.
4. `src/features/settings/SettingsScreen.vue` — the two number inputs. Durations are now user-configurable end-to-end, though nothing consumes them for timing yet.
5. `src/features/routines/RoutineBuilderScreen.vue` — creation toggle + per-row editor for `exerciseType`. Exercises can now be tagged and persisted; rest timer behavior still unchanged.
6. `src/features/workout/ActiveWorkoutScreen.vue` — remove `REST_SECONDS`, add the three resolver functions, rewire `checkRow`. **This is the step that activates the feature.**

## Verification

- `vue-tsc --noEmit` after each step.
- After step 6: tag one routine exercise `warmup` and leave another `regular` (step 5's UI), set distinct Settings values e.g. 20s / 90s (step 4's UI), run a workout checking sets for both, confirm the rest banner shows the right duration each time. Also test a superset pairing a warmup + regular exercise and confirm the fired rest is `Math.max()` of the two.
