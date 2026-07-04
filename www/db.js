// Dexie schema + every read/write helper. No other file should touch
// db.routines / db.exercises / db.sets directly — this keeps "weightInLbs is
// the only source of truth" invariant in one place.
//
// Dexie itself is loaded as a global <script> in index.html (UMD build), not
// an ES module, so we reference the global `Dexie` here.

const KG_TO_LBS = 2.20462262;
const CM_TO_IN = 0.39370078;

const db = new Dexie('IronTrackDB');
db.version(1).stores({
  routines: 'id, name',
  exercises: 'id, name, supersetWith',
  sets: 'id, exerciseId, date, weightInLbs',
});

// Only new tables need to be listed here — Dexie carries forward any table
// not mentioned in a later version() call unchanged, so this doesn't touch
// existing routines/exercises/sets data or require a migration step.
db.version(2).stores({
  metric_blueprints: 'id, name',
  metric_logs: 'id, blueprintId, date',
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

export function cmToIn(cm) {
  return cm * CM_TO_IN;
}

export function inToCm(inches) {
  return inches / CM_TO_IN;
}

// Single source for displaying a metric_logs.valueBaseline in whichever unit
// the caller wants, across both metric types (mass baseline = lbs, length
// baseline = inches).
export function formatMetricValue(valueBaseline, type, preferredUnit) {
  let value = valueBaseline;
  if (type === 'mass' && preferredUnit === 'kg') value = lbsToKg(valueBaseline);
  if (type === 'length' && preferredUnit === 'cm') value = inToCm(valueBaseline);
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

// ---------- Body metrics ----------

const DEFAULT_METRIC_BLUEPRINTS = [
  { id: 'm-weight', name: 'Body Weight', type: 'mass' },
  { id: 'm-waist', name: 'Waist Size', type: 'length' },
  { id: 'm-arms', name: 'Arm Size', type: 'length' },
  { id: 'm-calves', name: 'Calf Size', type: 'length' },
  { id: 'm-quads', name: 'Thigh Size', type: 'length' },
];

// Idempotent — only seeds if the table is empty, so it's safe to call on
// every app start without duplicating rows on subsequent loads.
export async function ensureMetricBlueprintsSeeded() {
  const count = await db.metric_blueprints.count();
  if (count > 0) return;
  await db.metric_blueprints.bulkAdd(DEFAULT_METRIC_BLUEPRINTS);
}

export async function createMetricBlueprint({ name, type }) {
  const blueprint = { id: crypto.randomUUID(), name, type };
  await db.metric_blueprints.add(blueprint);
  return blueprint;
}

export function getAllMetricBlueprints() {
  return db.metric_blueprints.toArray();
}

export function getMetricBlueprintById(id) {
  return db.metric_blueprints.get(id);
}

// The only place a metric log's valueBaseline gets computed: mass blueprints
// store lbs, length blueprints store inches, per the same
// convert-at-write-time pattern as logSet's weightInLbs.
export async function logMetric({ blueprintId, date, valueEntered, unit }) {
  const blueprint = await db.metric_blueprints.get(blueprintId);
  if (!blueprint) throw new Error('Unknown metric blueprint: ' + blueprintId);
  let valueBaseline = valueEntered;
  if (blueprint.type === 'mass' && unit === 'kg') valueBaseline = kgToLbs(valueEntered);
  if (blueprint.type === 'length' && unit === 'cm') valueBaseline = cmToIn(valueEntered);
  const log = {
    id: crypto.randomUUID(),
    blueprintId,
    date,
    valueEntered,
    unit,
    valueBaseline,
  };
  await db.metric_logs.add(log);
  return log;
}

// Chronologically-ascending last `limit` entries for a blueprint — directly
// plottable left-to-right on a chart with no further sorting needed.
export async function getRecentLogsForBlueprint(blueprintId, limit = 8) {
  const logs = await db.metric_logs.where('blueprintId').equals(blueprintId).toArray();
  logs.sort((a, b) => a.date.localeCompare(b.date));
  return logs.slice(-limit);
}

// ---------- Backup / restore ----------

export async function exportAllData() {
  const [routines, exercises, sets, metricBlueprints, metricLogs] = await Promise.all([
    db.routines.toArray(),
    db.exercises.toArray(),
    db.sets.toArray(),
    db.metric_blueprints.toArray(),
    db.metric_logs.toArray(),
  ]);
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    routines,
    exercises,
    sets,
    metricBlueprints,
    metricLogs,
  };
}

// bulkPut (not bulkAdd) so re-importing the same file is idempotent. Wrapped
// in a transaction so a failure partway through can't leave mixed state.
// metricBlueprints/metricLogs are optional so older (version 1) backups —
// taken before body metrics existed — still import cleanly.
export async function importAllData(payload) {
  if (!payload || !Array.isArray(payload.routines) || !Array.isArray(payload.exercises) || !Array.isArray(payload.sets)) {
    throw new Error('Invalid backup file: missing routines/exercises/sets arrays.');
  }
  const metricBlueprints = Array.isArray(payload.metricBlueprints) ? payload.metricBlueprints : [];
  const metricLogs = Array.isArray(payload.metricLogs) ? payload.metricLogs : [];
  await db.transaction('rw', db.routines, db.exercises, db.sets, db.metric_blueprints, db.metric_logs, async () => {
    await db.routines.bulkPut(payload.routines);
    await db.exercises.bulkPut(payload.exercises);
    await db.sets.bulkPut(payload.sets);
    await db.metric_blueprints.bulkPut(metricBlueprints);
    await db.metric_logs.bulkPut(metricLogs);
  });
}

export default db;
