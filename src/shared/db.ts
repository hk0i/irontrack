// Dexie schema + every read/write helper. No other file should touch
// db.routines / db.exercises / db.sets directly — this keeps "weightInLbs is
// the only source of truth" invariant in one place.

import Dexie, { type Table } from 'dexie';

const KG_TO_LBS = 2.20462262;
const CM_TO_IN = 0.39370078;

export type WeightUnit = 'lbs' | 'kg';
export type LengthUnit = 'in' | 'cm';
export type Unit = WeightUnit | LengthUnit;
export type MetricType = 'mass' | 'length';
export type ResistanceType = 'bodyweight' | 'bands' | 'weight';

export interface Routine {
  id: string;
  name: string;
  exerciseIds: string[];
}

export interface Exercise {
  id: string;
  name: string;
  supersetWith: string | null;
  // Optional — exercises created before this field existed have no key at
  // all, not just a falsy value. Every read site must fall back to
  // 'weight' (the prior implicit behavior) rather than assume presence.
  resistanceType?: ResistanceType;
}

export interface SetEntry {
  id: string;
  exerciseId: string;
  date: string;
  reps: number;
  weightEntered: number;
  unit: WeightUnit;
  weightInLbs: number;
  routineId: string | null;
  sessionId: string | null;
  createdAt: number;
  // Only meaningful for band-resistance exercises — plain field, not
  // indexed, so no Dexie version bump needed (same pattern as routineId).
  // Optional: sets logged before this field existed have no key at all.
  bandColors?: string[];
}

export interface WorkoutSession {
  id: string;
  routineId: string;
  date: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

export interface MetricBlueprint {
  id: string;
  name: string;
  type: MetricType;
}

export interface MetricLog {
  id: string;
  blueprintId: string;
  date: string;
  valueEntered: number;
  unit: Unit;
  valueBaseline: number;
}

interface BackupPayload {
  version: number;
  exportedAt: string;
  routines: Routine[];
  exercises: Exercise[];
  sets: SetEntry[];
  metricBlueprints?: MetricBlueprint[];
  metricLogs?: MetricLog[];
  workouts?: WorkoutSession[];
}

class IronTrackDB extends Dexie {
  routines!: Table<Routine, string>;
  exercises!: Table<Exercise, string>;
  sets!: Table<SetEntry, string>;
  metric_blueprints!: Table<MetricBlueprint, string>;
  metric_logs!: Table<MetricLog, string>;
  workouts!: Table<WorkoutSession, string>;

  constructor() {
    super('IronTrackDB');

    this.version(1).stores({
      routines: 'id, name',
      exercises: 'id, name, supersetWith',
      sets: 'id, exerciseId, date, weightInLbs',
    });

    // Only new tables need to be listed here — Dexie carries forward any
    // table not mentioned in a later version() call unchanged, so this
    // doesn't touch existing routines/exercises/sets data or require a
    // migration step.
    this.version(2).stores({
      metric_blueprints: 'id, name',
      metric_logs: 'id, blueprintId, date',
    });

    this.version(3).stores({
      workouts: 'id, routineId, date',
    });
  }
}

const db = new IronTrackDB();

// ---------- Unit conversion ----------

export function kgToLbs(kg: number): number {
  return kg * KG_TO_LBS;
}

export function lbsToKg(lbs: number): number {
  return lbs / KG_TO_LBS;
}

// Single source every display surface should call so rounding/conversion
// never drifts between the ghost text, chart tooltips, and set rows.
export function formatWeight(weightInLbs: number, preferredUnit: WeightUnit): number {
  const value = preferredUnit === 'kg' ? lbsToKg(weightInLbs) : weightInLbs;
  return Math.round(value * 10) / 10;
}

export function cmToIn(cm: number): number {
  return cm * CM_TO_IN;
}

export function inToCm(inches: number): number {
  return inches / CM_TO_IN;
}

// Single source for displaying a metric_logs.valueBaseline in whichever unit
// the caller wants, across both metric types (mass baseline = lbs, length
// baseline = inches).
export function formatMetricValue(valueBaseline: number, type: MetricType, preferredUnit: Unit): number {
  let value = valueBaseline;
  if (type === 'mass' && preferredUnit === 'kg') value = lbsToKg(valueBaseline);
  if (type === 'length' && preferredUnit === 'cm') value = inToCm(valueBaseline);
  return Math.round(value * 10) / 10;
}

// ---------- Routines ----------

export async function createRoutine({ name, exerciseIds }: { name: string; exerciseIds: string[] }): Promise<Routine> {
  const routine: Routine = { id: crypto.randomUUID(), name, exerciseIds: [...exerciseIds] };
  await db.routines.add(routine);
  return routine;
}

export function getAllRoutines(): Promise<Routine[]> {
  return db.routines.toArray();
}

export function getRoutineById(id: string): Promise<Routine | undefined> {
  return db.routines.get(id);
}

export function updateRoutine(id: string, patch: Partial<Routine>): Promise<number> {
  return db.routines.update(id, patch);
}

export function deleteRoutine(id: string): Promise<void> {
  return db.routines.delete(id);
}

// ---------- Exercises ----------

export async function createExercise({
  name,
  supersetWith = null,
  resistanceType = 'weight',
}: {
  name: string;
  supersetWith?: string | null;
  resistanceType?: ResistanceType;
}): Promise<Exercise> {
  const exercise: Exercise = { id: crypto.randomUUID(), name, supersetWith, resistanceType };
  await db.exercises.add(exercise);
  return exercise;
}

export function getAllExercises(): Promise<Exercise[]> {
  return db.exercises.toArray();
}

export function getExerciseById(id: string): Promise<Exercise | undefined> {
  return db.exercises.get(id);
}

export function updateExercise(id: string, patch: Partial<Exercise>): Promise<number> {
  return db.exercises.update(id, patch);
}

// Client-side substring match. Exercise counts are small (tens to low
// hundreds of rows) so a real fuzzy-search index isn't warranted for v1.
export async function searchExercises(query: string): Promise<Exercise[]> {
  const all = await db.exercises.toArray();
  const needle = query.trim().toLowerCase();
  if (!needle) return all;
  return all.filter((e) => e.name.toLowerCase().includes(needle));
}

// Links two exercises as a superset pair. supersetWith only has room for one
// partner per exercise, so this is scoped to pairs, not multi-exercise
// circuits. Defensively clears any pre-existing link on either side first so
// the invariant "supersetWith is always mutual or null" can't be violated.
export async function setSupersetLink(exerciseIdA: string, exerciseIdB: string): Promise<void> {
  await db.transaction('rw', db.exercises, async () => {
    await clearSupersetLink(exerciseIdA);
    await clearSupersetLink(exerciseIdB);
    await db.exercises.update(exerciseIdA, { supersetWith: exerciseIdB });
    await db.exercises.update(exerciseIdB, { supersetWith: exerciseIdA });
  });
}

export async function clearSupersetLink(exerciseId: string): Promise<void> {
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
// routineId is optional context (which routine the set was logged under) —
// stored as a plain field, not a declared/indexed schema column, so it needs
// no Dexie version bump. It powers the workout history screen's per-routine
// grouping and the dashboard's "suggested routine" rotation.
// createdAt is a plain (unindexed) precise timestamp, distinct from `date`
// (a YYYY-MM-DD logical workout day). date alone can't order two sets logged
// on the same calendar day — e.g. two different routines done today — so
// createdAt is used as a tiebreaker anywhere sets are sorted "most recent
// first".
// sessionId ties a set to the specific workout instance it was logged
// during (see logWorkoutSession) — it's what lets the history screen tell
// two same-day sessions of the same routine apart instead of merging their
// sets onto one card. Optional and unindexed, like routineId, so older sets
// logged before this existed still import/display fine (grouped by
// date+routineId as a fallback).
export async function logSet({
  exerciseId,
  date,
  reps,
  weightEntered,
  unit,
  routineId = null,
  sessionId = null,
  bandColors = [],
}: {
  exerciseId: string;
  date: string;
  reps: number;
  weightEntered: number;
  unit: WeightUnit;
  routineId?: string | null;
  sessionId?: string | null;
  bandColors?: string[];
}): Promise<SetEntry> {
  const weightInLbs = unit === 'kg' ? kgToLbs(weightEntered) : weightEntered;
  const set: SetEntry = {
    id: crypto.randomUUID(),
    exerciseId,
    date,
    reps,
    weightEntered,
    unit,
    weightInLbs,
    routineId,
    sessionId,
    createdAt: Date.now(),
    bandColors,
  };
  await db.sets.add(set);
  return set;
}

// Same write-time conversion rule as logSet, for correcting an existing
// entry from the workout history screen rather than creating a new one.
export async function updateSet(
  id: string,
  { reps, weightEntered, unit, bandColors }: { reps: number; weightEntered: number; unit: WeightUnit; bandColors?: string[] }
): Promise<Pick<SetEntry, 'reps' | 'weightEntered' | 'unit' | 'weightInLbs' | 'bandColors'>> {
  const weightInLbs = unit === 'kg' ? kgToLbs(weightEntered) : weightEntered;
  const patch = { reps, weightEntered, unit, weightInLbs, ...(bandColors !== undefined && { bandColors }) };
  await db.sets.update(id, patch);
  return patch;
}

// Every logged set, most recent day first — the source for the workout
// history screen, which groups these by date then by exercise.
export async function getAllSets(): Promise<SetEntry[]> {
  const sets = await db.sets.toArray();
  return sets.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
}

export function getSetsForExercise(exerciseId: string): Promise<SetEntry[]> {
  return db.sets
    .where('exerciseId')
    .equals(exerciseId)
    .toArray()
    .then((sets) => sets.sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0)));
}

// Heaviest set from the most recent OTHER workout that included this
// exercise — used for the active workout screen's ghost text. currentSessionId
// excludes the in-progress session's own sets, so mid-workout logging never
// makes the ghost text show what you just did; it always reflects the prior
// workout. Regardless of recency window — a lift not trained in a while
// should still show its last weight, that's when the hint is most useful.
export async function getLastWorkoutBestSetForExercise(exerciseId: string, currentSessionId: string | null = null): Promise<SetEntry | null> {
  const sets = await db.sets.where('exerciseId').equals(exerciseId).toArray();
  const candidates = currentSessionId ? sets.filter((s) => s.sessionId !== currentSessionId) : sets;
  if (candidates.length === 0) return null;

  // Dates are YYYY-MM-DD strings so lexicographic comparison equals
  // chronological comparison.
  const mostRecentDate = candidates.reduce((max, s) => (s.date.localeCompare(max) > 0 ? s.date : max), candidates[0].date);
  const onThatDate = candidates.filter((s) => s.date === mostRecentDate);
  return onThatDate.reduce((heaviest, s) => (s.weightInLbs > heaviest.weightInLbs ? s : heaviest));
}

export function deleteSet(id: string): Promise<void> {
  return db.sets.delete(id);
}

// ---------- Workout sessions (duration tracking) ----------

// One row per finished workout. startedAt is captured and held in the active
// workout screen's own state; this is only called once, when the user taps
// Finish, so an abandoned session never leaves a partial row here.
// id defaults to a fresh uuid, but the active workout screen passes the same
// sessionId it tagged this session's logSet calls with, so this row's id
// doubles as the join key the history screen uses to group a session's sets
// together instead of merging same-day-same-routine sessions.
export async function logWorkoutSession({
  id = crypto.randomUUID(),
  routineId,
  date,
  startedAt,
  endedAt,
}: {
  id?: string;
  routineId: string;
  date: string;
  startedAt: number;
  endedAt: number;
}): Promise<WorkoutSession> {
  const session: WorkoutSession = {
    id,
    routineId,
    date,
    startedAt,
    endedAt,
    durationMs: endedAt - startedAt,
  };
  await db.workouts.add(session);
  return session;
}

export function getAllWorkoutSessions(): Promise<WorkoutSession[]> {
  return db.workouts.toArray();
}

// ---------- Body metrics ----------

const DEFAULT_METRIC_BLUEPRINTS: MetricBlueprint[] = [
  { id: 'm-weight', name: 'Body Weight', type: 'mass' },
  { id: 'm-waist', name: 'Waist Size', type: 'length' },
  { id: 'm-arms', name: 'Arm Size', type: 'length' },
  { id: 'm-calves', name: 'Calf Size', type: 'length' },
  { id: 'm-quads', name: 'Thigh Size', type: 'length' },
];

// Idempotent — only seeds if the table is empty, so it's safe to call on
// every app start without duplicating rows on subsequent loads.
export async function ensureMetricBlueprintsSeeded(): Promise<void> {
  const count = await db.metric_blueprints.count();
  if (count > 0) return;
  await db.metric_blueprints.bulkAdd(DEFAULT_METRIC_BLUEPRINTS);
}

export async function createMetricBlueprint({ name, type }: { name: string; type: MetricType }): Promise<MetricBlueprint> {
  const blueprint: MetricBlueprint = { id: crypto.randomUUID(), name, type };
  await db.metric_blueprints.add(blueprint);
  return blueprint;
}

export function getAllMetricBlueprints(): Promise<MetricBlueprint[]> {
  return db.metric_blueprints.toArray();
}

export function getMetricBlueprintById(id: string): Promise<MetricBlueprint | undefined> {
  return db.metric_blueprints.get(id);
}

// The only place a metric log's valueBaseline gets computed: mass blueprints
// store lbs, length blueprints store inches, per the same
// convert-at-write-time pattern as logSet's weightInLbs.
export async function logMetric({
  blueprintId,
  date,
  valueEntered,
  unit,
}: {
  blueprintId: string;
  date: string;
  valueEntered: number;
  unit: Unit;
}): Promise<MetricLog> {
  const blueprint = await db.metric_blueprints.get(blueprintId);
  if (!blueprint) throw new Error('Unknown metric blueprint: ' + blueprintId);
  let valueBaseline = valueEntered;
  if (blueprint.type === 'mass' && unit === 'kg') valueBaseline = kgToLbs(valueEntered);
  if (blueprint.type === 'length' && unit === 'cm') valueBaseline = cmToIn(valueEntered);
  const log: MetricLog = {
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
export async function getRecentLogsForBlueprint(blueprintId: string, limit = 8): Promise<MetricLog[]> {
  const logs = await db.metric_logs.where('blueprintId').equals(blueprintId).toArray();
  logs.sort((a, b) => a.date.localeCompare(b.date));
  return logs.slice(-limit);
}

// ---------- Backup / restore ----------

export async function exportAllData(): Promise<BackupPayload> {
  const [routines, exercises, sets, metricBlueprints, metricLogs, workouts] = await Promise.all([
    db.routines.toArray(),
    db.exercises.toArray(),
    db.sets.toArray(),
    db.metric_blueprints.toArray(),
    db.metric_logs.toArray(),
    db.workouts.toArray(),
  ]);
  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    routines,
    exercises,
    sets,
    metricBlueprints,
    metricLogs,
    workouts,
  };
}

// bulkPut (not bulkAdd) so re-importing the same file is idempotent. Wrapped
// in a transaction so a failure partway through can't leave mixed state.
// metricBlueprints/metricLogs/workouts are optional so older backups — taken
// before body metrics or duration tracking existed — still import cleanly.
export async function importAllData(payload: unknown): Promise<void> {
  const data = payload as Partial<BackupPayload> | null | undefined;
  if (!data || !Array.isArray(data.routines) || !Array.isArray(data.exercises) || !Array.isArray(data.sets)) {
    throw new Error('Invalid backup file: missing routines/exercises/sets arrays.');
  }
  const metricBlueprints = Array.isArray(data.metricBlueprints) ? data.metricBlueprints : [];
  const metricLogs = Array.isArray(data.metricLogs) ? data.metricLogs : [];
  const workouts = Array.isArray(data.workouts) ? data.workouts : [];
  await db.transaction(
    'rw',
    [db.routines, db.exercises, db.sets, db.metric_blueprints, db.metric_logs, db.workouts],
    async () => {
      await db.routines.bulkPut(data.routines!);
      await db.exercises.bulkPut(data.exercises!);
      await db.sets.bulkPut(data.sets!);
      await db.metric_blueprints.bulkPut(metricBlueprints);
      await db.metric_logs.bulkPut(metricLogs);
      await db.workouts.bulkPut(workouts);
    }
  );
}

export default db;
