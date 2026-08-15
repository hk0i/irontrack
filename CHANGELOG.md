# Changelog

User-facing changes only — internal refactors, the TypeScript migration, and the Vue SFC rewrite aren't listed individually here, but are the main reason this release is versioned as a major bump rather than a minor one.

## 2.3.0

- **Rest timer**: warmup and regular exercises can now have their own rest duration instead of sharing one flat timer — set your own defaults for each in Settings, then tag each exercise as Warmup or Regular in the routine builder. A superset pairing both uses the longer of the two.
- **Dashboard**: routine cards can now be manually reordered via a drag handle — your order is remembered instead of resetting.
- **Dashboard**: routine cards' Edit/Delete icons moved behind a swipe-left panel, alongside a new **Duplicate** action for cloning a routine's exercise list into a new one. A one-time jiggle hint teaches the swipe gesture on your first routine.

## 2.2.0

- **Finish Workout**: tapping Finish now shows an optional "How'd it go?" step — pick a mood emoji (3 quick presets, or type your own) and/or leave a free-text note before the workout is saved. Skip both to finish exactly as before.
- **Workout History**: mood and notes captured on finish now show on that workout's history card.

## 2.1.0

- **Progress chart**: added a training volume line alongside weight, so bodyweight and band-resistance exercises (which always show 0 lbs) still show real progress via reps/sets performed. Switch between Weight, Volume, or Show all with the pill control above the chart.
- **Progress chart**: tap-and-drag any point to scrub through your history — a panel above the chart updates live with that day's date, top-set weight or volume, and number of sets, without covering the chart.

## 2.0.0

- **App updates**: new versions now show up as a green install icon plus a dismissible toast ("A new version is available") with an "Update now" button — tap either to reload instantly instead of waiting on the browser's own update timing.
- **Rest timer**: now stays accurate even if you background the app or navigate away mid-rest (previously it would freeze/drift); plays a sound and can send a notification when your rest period ends.
- **Workout History**: editing a bodyweight or band-resistance set now shows the right fields (band color chips, or just reps) instead of an irrelevant weight box.
- **Body Metrics**: chart entries are now tappable to view details, matching the Progress chart.
- **Active workout**: you can now add an exercise on the fly mid-workout — including picking its resistance type (weight/bodyweight/bands) — without leaving to edit the routine first.
- **Resume workout**: back out of an active workout (on purpose or by accident) and pick up exactly where you left off later — checked sets and all — via a "Resume" card on the dashboard that takes priority over the normal suggestion.
- **Themes**: added a second color theme ("onebigfunction") alongside the original, selectable in Settings.
- **Workout screen**: added a button to remove the trailing empty set row when you don't need it.
- **Exercises**: exercises can now be marked as bodyweight or band-resistance, with the right input fields (band-color chips, no weight field) everywhere they're logged or edited.
- **Workout duration**: workouts now track how long each session took, shown in Workout History.
- **Dashboard footer**: app version + commit hash shown in the corner, for easy reference across PWA updates.
- **Workout History**: added the ability to edit past workout entries and delete individual sets, to fix logging mistakes.
- **Dashboard**: added a rotating "suggested next workout" based on your routine order and history (later superseded/extended by the Resume card above).
- **Input polish**: full exercise names always visible on supersets (previously could get truncated), larger weight input field, and validation feedback when a required field is missing.
- **Offline/updates**: switched to network-first caching so the app always tries to fetch the latest version when online, falling back to your last cached copy offline — this is the foundation the new update-notification flow builds on.
- **Foundational features** (from the original 1.0.0 build, for completeness): routine builder with drag-to-reorder and superset linking, body metrics tracking, delete-workout, and the initial dashboard → active-workout → history flow.
