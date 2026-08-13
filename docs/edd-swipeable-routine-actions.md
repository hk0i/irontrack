# EDD: Swipeable Routine Card Actions (Edit / Duplicate / Delete)

## Goal

Right now, making a slightly different version of a routine (e.g. incline dumbbell press instead of flat press) means building an entire new routine by hand, or manually swapping exercises on an existing one each time you want to switch back. This adds a **Duplicate** action that clones a routine's exercise list into a new routine and drops the user straight into the editor on the copy, so they only have to rename it and change the one or two exercises that differ.

Adding Duplicate as a third icon button next to the dashboard's existing Edit/Delete icons doesn't scale — three small tap targets crammed into one card row is a UX problem on its own, before counting future actions. Instead, both icons are removed and all three actions (Edit, Duplicate, Delete) move behind a **swipe-left-to-reveal** panel, the standard mobile list pattern (iOS Mail/Reminders-style). The card shows no icons by default; a one-time jiggle animation on the first routine a user ever creates teaches the gesture, since it's otherwise undiscoverable.

## Data model

`duplicateRoutine(id: string): Promise<Routine>`, new function in `src/shared/db.ts`, placed after `deleteRoutine` (`db.ts:220-222`). No schema change — it's a thin wrapper around the existing `getRoutineById`/`createRoutine`, which already generates a fresh `crypto.randomUUID()` and defensively copies `exerciseIds` (`db.ts:203`).

The new copy's name uses a numbered suffix rather than "Copy of X" or "X (copy)", so that duplicating a duplicate produces a well-defined next name instead of accumulating "(copy) (copy)":

```ts
export async function duplicateRoutine(id: string): Promise<Routine> {
  const original = await getRoutineById(id);
  if (!original) throw new Error(`Routine ${id} not found`);
  const all = await getAllRoutines();
  const root = original.name.replace(/ \(\d+\)$/, '');
  const escapedRoot = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedRoot}(?: \\((\\d+)\\))?$`);
  let maxN = 1;
  for (const r of all) {
    const m = r.name.match(pattern);
    if (m) maxN = Math.max(maxN, m[1] ? Number(m[1]) : 1);
  }
  return createRoutine({ name: `${root} (${maxN + 1})`, exerciseIds: original.exerciseIds });
}
```

`"Push Day"` duplicates to `"Push Day (2)"`. Duplicating either the original or the `(2)` copy again scans all routines sharing the same root name, finds the highest existing number, and produces `"Push Day (3)"`.

## Changes

### 1. `src/shared/db.ts`

Add `duplicateRoutine()` as shown above.

### 2. `src/features/dashboard/DashboardScreen.vue` — swipe gesture + reveal panel

No gesture library exists in this codebase (`package.json` runtime deps are only `dexie` and `vue`) and no swipe/touch code exists anywhere today. The only precedent for a manual drag gesture is exercise reorder in `RoutineBuilderScreen.vue:54-98` — raw Pointer Events, `pointerdown` attaches `window`-level `pointermove`/`pointerup` listeners (removed on `pointerup` and in `onUnmounted`), offset driven by a ref via inline `transform`. This mirrors that pattern horizontally instead of vertically.

- Remove both existing `IconButton`s (`DashboardScreen.vue:157-166`, Edit and Delete).
- New state: `openSwipeId` ref (id of the one card currently revealed, or null — only one open at a time), a drag-offset ref, plus plain (non-reactive) locals for start X/Y and a direction lock, following the same pattern as `RoutineBuilderScreen`'s `draggingIndex`/`dragOffset`/`pointerStartY`.
- `pointerdown` on the card records the start position. The first `pointermove` past an ~8px threshold locks the gesture: horizontal movement dominant → treat as swipe, call `preventDefault()`, drive `translateX` on the card via the offset ref; vertical movement dominant → abort tracking entirely and let the browser's native scroll handle it. This keeps normal dashboard scrolling from fighting the swipe gesture.
- `pointerup` snaps the card fully open (if dragged past half the reveal width) or fully closed, via a CSS transition (the drag-time inline style has no transition, matching `RoutineBuilderScreen`'s "no transition while actively dragging" approach — the snap only animates after release).
- Starting a swipe or tap on a different card while one is open closes the previously-open one first.
- Tapping an already-open card's body closes it instead of calling `openRoutine()` (checked at the top of that handler).
- Revealed panel: an absolutely-positioned strip behind the card, right-aligned, three tappable segments in order **Edit → Duplicate → Delete** — Edit and Duplicate at `tone="default"`, Delete at `tone="danger"` (reusing `IconButton.vue`'s existing `bg-danger/15 text-danger` tokens), Delete placed rightmost/farthest since it's destructive and should require the most deliberate swipe to reach.
- Edit and Delete call the existing `editRoutine()` / `removeRoutine()` unchanged (the latter still goes through `confirmThenDelete`, `db.ts`'s `confirm.ts:7-10`, unmodified). Duplicate calls a new handler:
  ```ts
  async function copyRoutine(routine: Routine) {
    const copy = await duplicateRoutine(routine.id);
    emit('navigate', 'routine-builder', { routineId: copy.id });
  }
  ```

### 3. First-run jiggle hint

- `RoutineBuilderScreen.vue`'s `save()` create-path (`:191-203`) passes the new routine's id back on navigate: `emit('navigate', 'dashboard', { highlightRoutineId: routine.id })` — extends `NavParams`, using the same param-passing mechanism already used for `routineId` elsewhere (not a new pattern).
- `DashboardScreen.vue` checks a `localStorage` flag, `irontrack:swipe-hint-shown`. This is a UI/onboarding preference, not domain data, so it belongs in `localStorage` rather than Dexie — `db.ts`'s header comment reserves Dexie exclusively for domain entities.
- If the flag is unset and `navParams.highlightRoutineId` matches a rendered card, that card gets an `animate-swipe-hint` class (`style.css`'s `--animate-swipe-hint`, a small horizontal double-pulse followed by a pause, looping via `animation-iteration-count: infinite`) — not a fixed few cycles, since a user who doesn't notice the first couple of pulses should keep getting nudged rather than the hint silently giving up.
- Dismissal is behavioral, not time-based: `useSwipeReveal` (`src/shared/useSwipeReveal.ts`) takes an optional `onSwipeStart` callback, invoked the moment a pointer drag is first classified as a horizontal swipe (a genuine gesture attempt, regardless of which card or whether it ends up open or closed). `DashboardScreen.vue` wires this to clear `hintRoutineId` and set the `localStorage` flag — so the loop stops the instant the user tries the gesture for real, not after an arbitrary animation count, and never fires again on any future routine.

## Known limitation, accepted for v1

Once the Edit/Delete icons are removed, there's no non-swipe fallback for these actions — mouse/trackpad users still perform the same drag gesture (Pointer Events work with mouse-drag), but without an obvious visual cue beyond the one-time jiggle hint, which only ever fires once, on the very first routine a user creates. Worth revisiting if desktop usage turns out to matter; not solved for v1.

## Out of scope for v1

- No bulk duplicate.
- No swipe-right (only swipe-left is implemented; there's a single action set, not two).
- No "duplicate with exercise swapped" wizard — straight copy only, user edits after landing in the builder.
- No re-triggerable swipe hint.

## Sequencing

Four atomic, independently-committable changes, stopping after each:

1. Write this doc (`docs/edd-swipeable-routine-actions.md`) — no code changes.
2. `src/shared/db.ts` — `duplicateRoutine()`.
3. `DashboardScreen.vue` — swipe gesture + three-button reveal panel, wired to the existing `editRoutine`/`removeRoutine` and the new `copyRoutine`.
4. Jiggle hint — `RoutineBuilderScreen.vue` navParams change + `DashboardScreen.vue` first-run animation + `localStorage` flag.
