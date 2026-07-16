# EDD: Workout Duration Tracking

## Goal

Track how long each workout takes — start to finish — so it's possible to see whether a session is efficient or padded with downtime.

## Data model

New Dexie table `workouts`, schema version 3:

```js
db.version(3).stores({
  workouts: 'id, routineId, date',
});
```

Row shape:

```js
{
  id,
  routineId,
  date,        // YYYY-MM-DD, same convention as sets.date
  startedAt,   // epoch ms
  endedAt,     // epoch ms
  durationMs,  // endedAt - startedAt, computed once at write time
}
```

A separate table rather than a column on `sets`: a session isn't tied to any one set (an empty session with zero logged sets should still be timeable), and it mirrors the existing `metric_blueprints`/`metric_logs` split — a distinct concern gets its own table instead of being shoehorned onto an unrelated one.

## Start/end capture — `active-workout.js`

- On mount, if `routineId` is present, capture `startedAt = Date.now()` into a local `ref`. Held in memory only — nothing is written to IndexedDB yet.
- **Finish Workout** is the only action that ends and records a session: on click, capture `endedAt = Date.now()`, call `logWorkoutSession({ routineId, date: todayString(), startedAt, endedAt })`, then navigate to the dashboard.
- The header back-arrow keeps its current behavior (navigate to dashboard, no write). It's "leave without finishing," not "finish" — so backing out of a workout records no duration, only an explicit Finish does.

### Known limitation, accepted for v1

`startedAt` lives only in memory. If the tab is backgrounded and reclaimed by the OS (common for iOS Safari/PWA), or the app is force-closed mid-workout, the start time is lost and that session records no duration — same outcome as walking away without tapping Finish. This matches the original spec ("temporarily store the start time, then write it out on finish") and keeps this a one-field, one-screen change. If losing sessions to backgrounding turns out to be common in practice, the fix is mirroring `startedAt` into `localStorage` on capture and clearing it on finish — worth flagging now as a likely fast-follow, not building it for v1.

## `db.js` additions

```js
export async function logWorkoutSession({ routineId, date, startedAt, endedAt }) {
  const session = {
    id: crypto.randomUUID(),
    routineId,
    date,
    startedAt,
    endedAt,
    durationMs: endedAt - startedAt,
  };
  await db.workouts.add(session);
  return session;
}

export function getAllWorkoutSessions() {
  return db.workouts.toArray();
}
```

`exportAllData`/`importAllData` are extended to carry `workouts` (export `version` bumped to 3), using the same optional-array-with-fallback pattern already used for `metricBlueprints`/`metricLogs` so older backup files still import cleanly.

## Display — `workout-history.js`

Each history card is already grouped by a `date::routineId` key, the same key a session row would use. At load, fetch `getAllWorkoutSessions()` alongside sets/exercises/routines, index sessions by `date::routineId`, and attach a formatted duration (e.g. `42m` or `1h 12m`) to each `day` object — shown as a small pill next to the routine name in the card header.

If more than one session shares the same date + routineId (e.g. an AM and PM session of the same routine), list each duration separately rather than merging — consistent with how the rest of the screen avoids silently collapsing distinct entries. Cards with no matching session (sets logged before this feature existed, or a session that was abandoned rather than finished) simply show no duration pill — no backfill attempted.

## Out of scope for v1

- No duration trend chart on `progress-chart.js` — a plain number per session is enough to answer "am I wasting time"; a chart is a reasonable v2 if it proves useful.
- No live mid-workout stopwatch UI — only start/end capture, no ticking display during the workout.
- No `localStorage` durability hardening for the backgrounding limitation above.

## Sequencing

Three atomic, independently committable changes, stopping after each:

1. `www/db.js` — schema bump + `logWorkoutSession`/`getAllWorkoutSessions` + export/import wiring.
2. `www/components/active-workout.js` — capture `startedAt`, write the session on Finish.
3. `www/components/workout-history.js` — look up and display duration per card.
