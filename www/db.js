// Dexie schema + every read/write helper. No other file should touch
// db.routines / db.exercises / db.sets directly — this keeps "weightInLbs is
// the only source of truth" invariant in one place.
//
// Dexie itself is loaded as a global <script> in index.html (UMD build), not
// an ES module, so we reference the global `Dexie` here.

const KG_TO_LBS = 2.20462262;

const db = new Dexie('IronTrackDB');
db.version(1).stores({
  routines: 'id, name',
  exercises: 'id, name, supersetWith',
  sets: 'id, exerciseId, date, weightInLbs',
});

// ---------- Unit conversion ----------

export function kgToLbs(kg) {
  return kg * KG_TO_LBS;
}

export function lbsToKg(lbs) {
  return lbs / KG_TO_LBS;
}

// Single source every display surface should call so rounding/conversion
// never drifts between the ghost text, chart tooltips, and set rows.
export function formatWeight(weightInLbs, preferredUnit) {
  const value = preferredUnit === 'kg' ? lbsToKg(weightInLbs) : weightInLbs;
  return Math.round(value * 10) / 10;
}

// ---------- Routines ----------

export async function createRoutine({ name, exerciseIds }) {
  const routine = { id: crypto.randomUUID(), name, exerciseIds: [...exerciseIds] };
  await db.routines.add(routine);
  return routine;
}

export function getAllRoutines() {
  return db.routines.toArray();
}

export function getRoutineById(id) {
  return db.routines.get(id);
}

export function updateRoutine(id, patch) {
  return db.routines.update(id, patch);
}

export function deleteRoutine(id) {
  return db.routines.delete(id);
}

// ---------- Exercises ----------

export async function createExercise({ name, supersetWith = null }) {
  const exercise = { id: crypto.randomUUID(), name, supersetWith };
  await db.exercises.add(exercise);
  return exercise;
}

export function getAllExercises() {
  return db.exercises.toArray();
}

export function getExerciseById(id) {
  return db.exercises.get(id);
}

// Client-side substring match. Exercise counts are small (tens to low
// hundreds of rows) so a real fuzzy-search index isn't warranted for v1.
export async function searchExercises(query) {
  const all = await db.exercises.toArray();
  const needle = query.trim().toLowerCase();
  if (!needle) return all;
  return all.filter((e) => e.name.toLowerCase().includes(needle));
}

// Links two exercises as a superset pair. supersetWith only has room for one
// partner per exercise, so this is scoped to pairs, not multi-exercise
// circuits. Defensively clears any pre-existing link on either side first so
// the invariant "supersetWith is always mutual or null" can't be violated.
export async function setSupersetLink(exerciseIdA, exerciseIdB) {
  await db.transaction('rw', db.exercises, async () => {
    await clearSupersetLink(exerciseIdA);
    await clearSupersetLink(exerciseIdB);
    await db.exercises.update(exerciseIdA, { supersetWith: exerciseIdB });
    await db.exercises.update(exerciseIdB, { supersetWith: exerciseIdA });
  });
}

export async function clearSupersetLink(exerciseId) {
  const exercise = await db.exercises.get(exerciseId);
  if (!exercise || !exercise.supersetWith) return;
  const partnerId = exercise.supersetWith;
  await db.exercises.update(exerciseId, { supersetWith: null });
  const partner = await db.exercises.get(partnerId);
  if (partner && partner.supersetWith === exerciseId) {
    await db.exercises.update(partnerId, { supersetWith: null });
  }
}

// ---------- Sets (history) ----------

// The only place weightInLbs gets computed, per the spec's exact formula.
export async function logSet({ exerciseId, date, reps, weightEntered, unit }) {
  const weightInLbs = unit === 'kg' ? kgToLbs(weightEntered) : weightEntered;
  const set = {
    id: crypto.randomUUID(),
    exerciseId,
    date,
    reps,
    weightEntered,
    unit,
    weightInLbs,
  };
  await db.sets.add(set);
  return set;
}

export function getSetsForExercise(exerciseId) {
  return db.sets
    .where('exerciseId')
    .equals(exerciseId)
    .toArray()
    .then((sets) => sets.sort((a, b) => a.date.localeCompare(b.date)));
}

// Most recent logged set for an exercise, regardless of recency window — a
// lift not trained in a while should still show its last weight, that's when
// the hint is most useful. Dates are YYYY-MM-DD strings so lexicographic sort
// equals chronological sort.
export async function getLastSetForExercise(exerciseId) {
  const sets = await db.sets.where('exerciseId').equals(exerciseId).toArray();
  if (sets.length === 0) return null;
  return sets.sort((a, b) => b.date.localeCompare(a.date))[0];
}

export function deleteSet(id) {
  return db.sets.delete(id);
}

// ---------- Backup / restore ----------

export async function exportAllData() {
  const [routines, exercises, sets] = await Promise.all([
    db.routines.toArray(),
    db.exercises.toArray(),
    db.sets.toArray(),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    routines,
    exercises,
    sets,
  };
}

// bulkPut (not bulkAdd) so re-importing the same file is idempotent. Wrapped
// in a transaction so a failure partway through can't leave mixed state.
export async function importAllData(payload) {
  if (!payload || !Array.isArray(payload.routines) || !Array.isArray(payload.exercises) || !Array.isArray(payload.sets)) {
    throw new Error('Invalid backup file: missing routines/exercises/sets arrays.');
  }
  await db.transaction('rw', db.routines, db.exercises, db.sets, async () => {
    await db.routines.bulkPut(payload.routines);
    await db.exercises.bulkPut(payload.exercises);
    await db.sets.bulkPut(payload.sets);
  });
}

export default db;
