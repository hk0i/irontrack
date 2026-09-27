# Manually Cancel Workout
When toying with the app it's common to start a workout that we won't finish, trying to start a new workout of the same type doesn't seem to trigger a new start time for the workout (based on UI feedback).

1. Make sure it's possible to cancel an in-progress working by adding a delete button (X or trash icon) on the Resume workout row
2. Resume confirmation
    1. When tapping the same workout from the list prompt user for what to do: delete previous workout, finish previous workout or resume previous workout.
    2. Entering from the resume row prevents this resume confirmation dialog

# `db.ts` growing in size
1. Can we split it up?

# `ActiveWorkoutScreen.vue` `loadWorkout()`
1. Do NOT extract into helper functions despite its phase-comment blocks — seeding must finish before block-building runs (groupedRows() reads unseeded members otherwise), and routineExerciseIds threads through all phases. Splitting trades a legible function for an implicit ordering contract.

# Verify after circuit/group UI lands (step 6+)
1. `pruneOrphanGroups` (exercises.ts) reads `db.exercises.where('groupId').equals(groupId)` inside the same transaction that just wrote new groupId values — confirm it sees those writes, not pre-transaction state. Test: group A+B+C, regroup C into a new pair with D, confirm A+B survive as a group and nothing's left holding a singleton groupId.

# Clean Up `docs/`
1. Adopt an `.edd.md` standard extension format
2. Rename all docs to sequential numbering instead of date-prefixed — same-day docs currently have no ordering signal (do after the circuit/superset feature lands)