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

# Rest Timer Alerts (`docs/2026-10-05-Rest-Timer-Alerts.edd.md`)
1. Steps 2–6 of the EDD sequence remain: Wake Lock, vibrate, Settings toggles + Test alert button, notification permission from a tap, CHANGELOG.
2. Tune beep loudness: step 1 works on iOS (ducks music) but gain is a bit low — raise the `0.2` gain in `playRestSound()` and re-check on device. Consider a volume setting alongside the step 4 toggles.

# Double Weights Checkbox

Have a way to track number of dumbbells -- maybe a checkbox to say x2, so if we have 35lbs on a lift we can say x2 to make sure we know it's 2dbs at 35 lbs each

# Change resistance band buttons to color swatches to save space.

Use color swatches instead of text labels on the UI to save horizontal space.

# Target weight/auto warm up weight feature

Set target weight and autofill warm up set weight and number of warm up sets and stylize them differently so we can tell them apart at a glance.