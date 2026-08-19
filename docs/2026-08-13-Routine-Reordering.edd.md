# EDD: Manual Routine Reordering

| | |
|---|---|
| **Date** | 2026-08-13 |
| **Author** | Gregory McQuillan |

## Goal

Once duplicates exist, users will want to control the dashboard's routine order — the "Suggested" rotation (`computeSuggestedRoutine`, `DashboardScreen.vue:59-66`) walks the displayed list in order and suggests the next one after whichever was last performed, so list order directly drives which routine gets suggested next.

This surfaced an existing gap: there is no persisted order today. `getAllRoutines()` (`db.ts:208-210`) is a plain `db.routines.toArray()`, and Dexie iterates by primary key when no explicit sort is applied — since `Routine.id` is a random UUID, today's dashboard order is arbitrary, not creation order, not user-controlled. Manual reordering needs a real persisted `sortOrder` field, not a UI-only reshuffle. A dedicated drag-handle icon on each card lets users reorder the list directly.

## Data model

`Routine.sortOrder?: number` (`db.ts:30-34`), an additive optional field — no `.version()` bump, same reasoning already used for every other optional field added post-v1 (`Exercise.resistanceType`, `WorkoutSession.mood`/`note`, etc.).

`createRoutine` sets `sortOrder: Date.now()` at creation time, so new routines naturally sort after existing ones without needing to query for a max value first:

```ts
export async function createRoutine({ name, exerciseIds }: { name: string; exerciseIds: string[] }): Promise<Routine> {
  const routine: Routine = { id: crypto.randomUUID(), name, exerciseIds: [...exerciseIds], sortOrder: Date.now() };
  await db.routines.add(routine);
  return routine;
}
```

`getAllRoutines` sorts by it. Routines created before this field existed have no `sortOrder` — treated as `0` so they sort before any dated routine, which is no worse than today's undefined order and avoids reshuffling an existing user's list on first load after the update:

```ts
export async function getAllRoutines(): Promise<Routine[]> {
  const all = await db.routines.toArray();
  return all.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}
```

New `reorderRoutines(orderedIds: string[]): Promise<void>`, called once a drag-reorder completes, persisting sequential positions:

```ts
export async function reorderRoutines(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, index) => db.routines.update(id, { sortOrder: index })));
}
```

No changes needed to `computeSuggestedRoutine`/`resolveResumableRoutine` — both already just walk whatever array `getAllRoutines()` returns, so rotation automatically respects manual ordering.

## Changes

### 1. `src/shared/db.ts`

- `Routine` gains `sortOrder?: number`.
- `createRoutine` sets it.
- `getAllRoutines` sorts by it.
- New `reorderRoutines()`.

### 2. New `src/shared/useDragReorder.ts` — extracted from `RoutineBuilderScreen.vue`

`RoutineBuilderScreen.vue:54-98` already implements vertical drag-to-reorder for its exercise list (raw Pointer Events, `pointerdown` on a dedicated handle attaches `window`-level `pointermove`/`pointerup`, index math via `Math.round(offset / rowStep)` with array splicing, `pointerStartY` re-based after each swap). Rather than writing that same pointer math again for the dashboard's routine list, it's extracted into a shared composable — following the same precedent as `useSwipeReveal.ts` (extracted from `DashboardScreen.vue`'s own swipe gesture in `2026-08-12-Swipeable-Routine-Actions.edd.md`) — and `RoutineBuilderScreen.vue` is refactored to consume it, so the logic has exactly one implementation instead of two near-identical copies.

`useDragReorder<T>(items: Ref<T[]>, options?: { gap?: number; fallbackHeight?: number; onDrop?: () => void })`:
- `items` is the reactive array being reordered — spliced live during the drag, exactly as `RoutineBuilderScreen.selectedExercises` is today.
- `gap`/`fallbackHeight` are supplied per caller, since the dashboard's routine cards (`space-y-3`, ~84-108px tall) are a different size than the builder's exercise rows (`space-y-2`, ~56px) — the composable has no built-in assumption about either.
- `onDrop`, called on `pointerup`, is optional: `RoutineBuilderScreen` doesn't need it (the reordered `exerciseIds` array is only persisted when the user taps Save), but the dashboard uses it to call `reorderRoutines()` immediately, since there's no separate save step for list order.
- Returns `{ draggingIndex, dragOffset, setRowEl, onRowPointerDown }` — the same shape `RoutineBuilderScreen`'s template already binds to (`:ref`, `:style` transform, `@pointerdown`), so its template needs no changes beyond reading these off the composable instead of local refs.

### 3. `src/features/routines/RoutineBuilderScreen.vue` — refactor onto the composable

Replace the inline `draggingIndex`/`dragOffset`/`rowEls`/`pointerStartY`/`rowStep` state and the three `onRowPointer*` functions with a single `useDragReorder(selectedExercises, { gap: 8, fallbackHeight: 56 })` call. Template bindings (`:ref`, `:style`, `@pointerdown`) stay the same, just sourced from the composable's return value. Pure refactor — no behavior change, verified by re-running the existing exercise-reorder flow.

### 4. `src/features/dashboard/DashboardScreen.vue` — drag-handle UI

- Add a drag-handle `IconButton` (grip icon, default tone) to each card — the one visible icon reintroduced onto the card, since the Edit/Duplicate/Delete actions already moved behind the swipe panel (`2026-08-12-Swipeable-Routine-Actions.edd.md`).
- `useDragReorder(routines, { gap: 12, fallbackHeight: 92, onDrop: () => reorderRoutines(routines.value.map(r => r.id)) })` — `gap: 12` matches the dashboard list's `space-y-3`.
- `pointerdown` on the handle calls `event.stopPropagation()` so it doesn't also start the card's horizontal swipe-tracking (`useSwipeReveal`'s `onPointerDown` is bound to the card body, a sibling concern).
- Starting a reorder drag closes any open swipe panel first (simplest correct behavior — avoids two active gesture states on the list at once).

## Known limitation, accepted for v1

Dragging a card to reorder while another card's swipe panel is open isn't specially animated — the panel just closes immediately when the drag starts, no separate transition for that case.

## Out of scope for v1

No reordering via any non-drag input (no up/down buttons, no keyboard reorder). No animation polish beyond what `RoutineBuilderScreen`'s existing reorder already has.

## Sequencing

Four atomic, independently-committable changes, stopping after each:

1. Write this doc (`docs/2026-08-13-Routine-Reordering.edd.md`) — no code changes.
2. `src/shared/db.ts` — `sortOrder` field, `createRoutine`/`getAllRoutines` updates, `reorderRoutines()`.
3. New `src/shared/useDragReorder.ts` + `RoutineBuilderScreen.vue` refactored onto it — pure extraction, no behavior change.
4. `DashboardScreen.vue` — drag-handle UI wired to `useDragReorder()`/`reorderRoutines()`.
