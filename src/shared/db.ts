/**
 * Dexie schema + every read/write helper.
 * No other file should touch db.routines / db.exercises / db.sets directly —
 * this keeps "weightInLbs is the only source of truth" invariant in one place.
 */

import Dexie, { type Table } from 'dexie';

const KG_TO_LBS = 2.20462262;
const CM_TO_IN = 0.39370078;

export type WeightUnit = 'lbs' | 'kg';
export type LengthUnit = 'in' | 'cm';
export type Unit = WeightUnit | LengthUnit;
export type MetricType = 'mass' | 'length';
export type ResistanceType = 'bodyweight' | 'bands' | 'weight' | 'mobility';

/**
 * Display metadata for every picker that lets a user set an exercise's
 * resistance type at creation time (RoutineBuilderScreen, ActiveWorkoutScreen's
 * ad-hoc add panel).
 */
export const RESISTANCE_TYPES: { value: ResistanceType; label: string }[] = [
  { value: 'weight', label: 'Weight' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'bands', label: 'Bands' },
  { value: 'mobility', label: 'Mobility' },
];

export type ExerciseType = 'warmup' | 'regular';

/**
 * Display metadata for every picker that lets a user set an exercise's
 * type at creation time (RoutineBuilderScreen) or edit it after
 * (RoutineBuilderScreen's per-row cycle select). Drives which of
 * Settings' two rest-duration defaults ActiveWorkoutScreen uses.
 */
export const EXERCISE_TYPES: { value: ExerciseType; label: string }[] = [
  { value: 'regular', label: 'Regular' },
  { value: 'warmup', label: 'Warmup' },
];

export interface Routine {
  id: string;
  name: string;
  exerciseIds: string[];
  /** Dashboard display order. Missing on routines created before manual
   * reordering existed — getAllRoutines treats that as 0, sorting them
   * ahead of any dated routine. */
  sortOrder?: number;
}

export interface Exercise {
  id: string;
  name: string;
  supersetWith: string | null;
  /**
   * Optional — exercises created before this field existed have no key at
   * all, not just a falsy value. Every read site must fall back to
   * 'weight' (the prior implicit behavior) rather than assume presence.
   */
  resistanceType?: ResistanceType;
  /**
   * Optional — exercises created before this field existed have no key at
   * all. Every read site must fall back to 'regular' (the prior implicit
   * flat-90s rest behavior), never silently treat an absent value as
   * 'warmup'.
   */
  exerciseType?: ExerciseType;
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
  /**
   * Only meaningful for band-resistance exercises — plain field, not
   * indexed, so no Dexie version bump needed (same pattern as routineId).
   * Optional: sets logged before this field existed have no key at all.
   */
  bandColors?: string[];
}

export interface WorkoutSession {
  id: string;
  routineId: string;
  date: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  /**
   * Optional — an emoji (preset or freely typed) the user picked when
   * finishing this workout. Plain field, not indexed, so no Dexie version
   * bump needed (same pattern as SetEntry.bandColors). Sessions logged
   * before this field existed have no key at all.
   */
  mood?: string;
  /**
   * Optional free-text note captured at finish time, same optionality and
   * versioning story as `mood`.
   */
  note?: string;
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

/**
 * Single source every display surface should call so rounding/conversion
 * never drifts between the ghost text, chart tooltips, and set rows.
 */
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

/**
 * Single source for displaying a metric_logs.valueBaseline in whichever unit
 * the caller wants, across both metric types (mass baseline = lbs, length
 * baseline = inches).
 */
export function formatMetricValue(valueBaseline: number, type: MetricType, preferredUnit: Unit): number {
  let value = valueBaseline;
  if (type === 'mass' && preferredUnit === 'kg') value = lbsToKg(valueBaseline);
  if (type === 'length' && preferredUnit === 'cm') value = inToCm(valueBaseline);
  return Math.round(value * 10) / 10;
}

// ---------- Dates ----------

/**
 * The app's logical-workout-day string (YYYY-MM-DD), same convention as
 * SetEntry.date/MetricLog.date — local time, not UTC, so "today" matches
 * what the clock on the device actually reads.
 */
export function todayString(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ---------- Routines ----------

export interface NewRoutineInput {
  name: string;
  exerciseIds: string[];
}

export async function createRoutine({ name, exerciseIds }: NewRoutineInput): Promise<Routine> {
  const routine: Routine = { id: crypto.randomUUID(), name, exerciseIds: [...exerciseIds], sortOrder: Date.now() };
  await db.routines.add(routine);
  return routine;
}

export async function getAllRoutines(): Promise<Routine[]> {
  const all = await db.routines.toArray();
  return all.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
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

/**
 * Clones a routine's exerciseIds into a new routine, naming it with the
 * next unused number in the name's family (e.g. "Push Day" -> "Push Day
 * (2)"), so duplicating a duplicate produces a well-defined next name
 * instead of accumulating "(copy) (copy)".
 */
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

/** Persists a manually dragged order as sequential sortOrder values. */
export async function reorderRoutines(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, index) => db.routines.update(id, { sortOrder: index })));
}

/**
 * Resolves a routine's exerciseIds into their Exercise records, in order,
 * silently skipping any id whose exercise has since been deleted.
 */
export async function getExercisesForRoutine(routine: Routine): Promise<Exercise[]> {
  const exercises: Exercise[] = [];
  for (const id of routine.exerciseIds) {
    const exercise = await getExerciseById(id);
    if (exercise) exercises.push(exercise);
  }
  return exercises;
}

// ---------- Exercises ----------

export async function createExercise({
  name,
  supersetWith = null,
  resistanceType = 'weight',
  exerciseType = 'regular',
}: {
  name: string;
  supersetWith?: string | null;
  resistanceType?: ResistanceType;
  exerciseType?: ExerciseType;
}): Promise<Exercise> {
  const exercise: Exercise = { id: crypto.randomUUID(), name, supersetWith, resistanceType, exerciseType };
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

/**
 * Client-side substring match.
 * Exercise counts are small (tens to low hundreds of rows) so a real
 * fuzzy-search index isn't warranted for v1.
 */
export async function searchExercises(query: string): Promise<Exercise[]> {
  const all = await db.exercises.toArray();
  const needle = query.trim().toLowerCase();
  if (!needle) return all;
  return all.filter((e) => e.name.toLowerCase().includes(needle));
}

/**
 * Links two exercises as a superset pair.
 * supersetWith only has room for one partner per exercise, so this is scoped
 * to pairs, not multi-exercise circuits. Defensively clears any pre-existing
 * link on either side first so the invariant "supersetWith is always mutual
 * or null" can't be violated.
 */
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

/**
 * The only place weightInLbs gets computed, per the spec's exact formula.
 * routineId is optional context (which routine the set was logged under) —
 * stored as a plain field, not a declared/indexed schema column, so it needs
 * no Dexie version bump. It powers the workout history screen's per-routine
 * grouping and the dashboard's "suggested routine" rotation.
 * createdAt is a plain (unindexed) precise timestamp, distinct from `date`
 * (a YYYY-MM-DD logical workout day). date alone can't order two sets logged
 * on the same calendar day — e.g. two different routines done today — so
 * createdAt is used as a tiebreaker anywhere sets are sorted "most recent
 * first".
 * sessionId ties a set to the specific workout instance it was logged
 * during (see logWorkoutSession) — it's what lets the history screen tell
 * two same-day sessions of the same routine apart instead of merging their
 * sets onto one card. Optional and unindexed, like routineId, so older sets
 * logged before this existed still import/display fine (grouped by
 * date+routineId as a fallback).
 */
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

/**
 * Same write-time conversion rule as logSet, for correcting an existing
 * entry from the workout history screen rather than creating a new one.
 */
export async function updateSet(
  id: string,
  { reps, weightEntered, unit, bandColors }: { reps: number; weightEntered: number; unit: WeightUnit; bandColors?: string[] }
): Promise<Pick<SetEntry, 'reps' | 'weightEntered' | 'unit' | 'weightInLbs' | 'bandColors'>> {
  const weightInLbs = unit === 'kg' ? kgToLbs(weightEntered) : weightEntered;
  const patch = { reps, weightEntered, unit, weightInLbs, ...(bandColors !== undefined && { bandColors }) };
  await db.sets.update(id, patch);
  return patch;
}

/**
 * Every logged set, most recent day first — the source for the workout
 * history screen, which groups these by date then by exercise.
 */
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

/**
 * All sets logged under one workout instance, oldest first — used to
 * rehydrate ActiveWorkoutScreen's checked rows when resuming a session
 * left in progress. sessionId is a plain (unindexed) field like routineId,
 * so this filters client-side rather than using .where().equals().
 */
export async function getSetsForSession(sessionId: string): Promise<SetEntry[]> {
  const sets = await db.sets.filter((s) => s.sessionId === sessionId).toArray();
  return sets.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

/**
 * Heaviest set from the most recent OTHER workout that included this
 * exercise — used for the active workout screen's ghost text.
 * currentSessionId excludes the in-progress session's own sets, so
 * mid-workout logging never makes the ghost text show what you just did; it
 * always reflects the prior workout. Regardless of recency window — a lift
 * not trained in a while should still show its last weight, that's when the
 * hint is most useful.
 */
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

/**
 * Heaviest set from the most recent date this exercise was logged strictly
 * before beforeDate — distinct from getLastWorkoutBestSetForExercise, which
 * excludes one session id rather than respecting chronological position
 * (wrong when viewing an arbitrary historical session, not just the
 * in-progress one). That function's behavior/callers are untouched here.
 */
export async function getPreviousBestSetForExercise(exerciseId: string, beforeDate: string): Promise<SetEntry | null> {
  const sets = await db.sets.where('exerciseId').equals(exerciseId).toArray();
  const candidates = sets.filter((s) => s.date < beforeDate);
  if (candidates.length === 0) return null;
  const mostRecentDate = candidates.reduce((max, s) => (s.date.localeCompare(max) > 0 ? s.date : max), candidates[0].date);
  const onThatDate = candidates.filter((s) => s.date === mostRecentDate);
  return onThatDate.reduce((heaviest, s) => (s.weightInLbs > heaviest.weightInLbs ? s : heaviest));
}

export interface ExercisePersonalBests {
  maxWeightInLbs: number;
  maxReps: number;
}

/** Full-history max weight/reps for one exercise. Call once per exercise
 *  present in the viewed session, not for every exercise in the app. */
export async function getPersonalBestsForExercise(exerciseId: string): Promise<ExercisePersonalBests | null> {
  const sets = await getSetsForExercise(exerciseId);
  if (sets.length === 0) return null;
  return {
    maxWeightInLbs: Math.max(...sets.map((s) => s.weightInLbs)),
    maxReps: Math.max(...sets.map((s) => s.reps)),
  };
}

// ---------- Workout sessions (duration tracking) ----------

/**
 * One row per finished workout.
 * startedAt is captured and held in the active workout screen's own state;
 * this is only called once, when the user taps Finish, so an abandoned
 * session never leaves a partial row here.
 * id defaults to a fresh uuid, but the active workout screen passes the same
 * sessionId it tagged this session's logSet calls with, so this row's id
 * doubles as the join key the history screen uses to group a session's sets
 * together instead of merging same-day-same-routine sessions.
 */
export async function logWorkoutSession({
  id = crypto.randomUUID(),
  routineId,
  date,
  startedAt,
  endedAt,
  mood,
  note,
}: {
  id?: string;
  routineId: string;
  date: string;
  startedAt: number;
  endedAt: number;
  mood?: string;
  note?: string;
}): Promise<WorkoutSession> {
  const session: WorkoutSession = {
    id,
    routineId,
    date,
    startedAt,
    endedAt,
    durationMs: endedAt - startedAt,
    ...(mood && { mood }),
    ...(note && { note }),
  };
  await db.workouts.add(session);
  return session;
}

export function getAllWorkoutSessions(): Promise<WorkoutSession[]> {
  return db.workouts.toArray();
}

export function getWorkoutSessionById(id: string): Promise<WorkoutSession | undefined> {
  return db.workouts.get(id);
}

/**
 * Sets for a pre-sessionId session, matched by date+routineId — the same
 * key WorkoutHistoryScreen's legacy grouping already uses, so legacy rows
 * stay viewable/editable without a schema migration.
 */
export async function getSetsForLegacySession(date: string, routineId: string | null): Promise<SetEntry[]> {
  const sets = await getAllSets();
  return sets
    .filter((s) => !s.sessionId && s.date === date && (s.routineId || null) === routineId)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

// ---------- Body metrics ----------

const DEFAULT_METRIC_BLUEPRINTS: MetricBlueprint[] = [
  { id: 'm-weight', name: 'Body Weight', type: 'mass' },
  { id: 'm-waist', name: 'Waist Size', type: 'length' },
  { id: 'm-arms', name: 'Arm Size', type: 'length' },
  { id: 'm-calves', name: 'Calf Size', type: 'length' },
  { id: 'm-quads', name: 'Thigh Size', type: 'length' },
];

/**
 * Idempotent — only seeds if the table is empty, so it's safe to call on
 * every app start without duplicating rows on subsequent loads.
 */
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

/**
 * The only place a metric log's valueBaseline gets computed: mass blueprints
 * store lbs, length blueprints store inches, per the same
 * convert-at-write-time pattern as logSet's weightInLbs.
 */
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

/**
 * Chronologically-ascending last `limit` entries for a blueprint — directly
 * plottable left-to-right on a chart with no further sorting needed.
 */
export async function getRecentLogsForBlueprint(blueprintId: string, limit = 8): Promise<MetricLog[]> {
  const logs = await db.metric_logs.where('blueprintId').equals(blueprintId).toArray();
  logs.sort((a, b) => a.date.localeCompare(b.date));
  return logs.slice(-limit);
}

/**
 * Every logged body weight, oldest first — used to give bodyweight-exercise
 * sets a real load figure for the volume metric, as of each set's own date
 * (not today's weight), so a historical set's volume doesn't drift every
 * time a new body weight is logged.
 */
export async function getBodyWeightLogs(): Promise<MetricLog[]> {
  const logs = await db.metric_logs.where('blueprintId').equals('m-weight').toArray();
  return logs.sort((a, b) => a.date.localeCompare(b.date));
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

/**
 * bulkPut (not bulkAdd) so re-importing the same file is idempotent.
 * Wrapped in a transaction so a failure partway through can't leave mixed
 * state. metricBlueprints/metricLogs/workouts are optional so older backups
 * — taken before body metrics or duration tracking existed — still import
 * cleanly.
 */
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

// ---------- Routine sharing (routines-only export/import) ----------
// Separate from Backup/restore above: this payload never touches sets,
// workouts, or body-metric data, so sharing a routine can't leak personal
// training history.

export interface RoutineSharePayload {
  kind: 'routines-share';
  version: number;
  exportedAt: string;
  routines: Routine[];
  exercises: Exercise[];
}

export function isRoutineSharePayload(data: unknown): data is RoutineSharePayload {
  const d = data as Partial<RoutineSharePayload> | null | undefined;
  return !!d && d.kind === 'routines-share' && Array.isArray(d.routines) && Array.isArray(d.exercises);
}

/**
 * Bundles the given routines with the exercises they reference (resolved via
 * getExercisesForRoutine's same id-based lookup, deduplicated across
 * routines) — no sets/workouts/metric data is ever read here.
 */
export async function exportRoutines(routineIds: string[]): Promise<RoutineSharePayload> {
  const routines = (await Promise.all(routineIds.map((id) => getRoutineById(id)))).filter(
    (r): r is Routine => !!r
  );
  const exerciseIds = new Set<string>();
  for (const routine of routines) {
    for (const id of routine.exerciseIds) exerciseIds.add(id);
  }
  const exercises = (await Promise.all([...exerciseIds].map((id) => getExerciseById(id)))).filter(
    (e): e is Exercise => !!e
  );
  return {
    kind: 'routines-share',
    version: 1,
    exportedAt: new Date().toISOString(),
    routines,
    exercises,
  };
}

export interface RoutineImportConflict<T> {
  incoming: T;
  existing: T;
}

export interface RoutineImportConflicts {
  routineConflicts: RoutineImportConflict<Routine>[];
  exerciseConflicts: RoutineImportConflict<Exercise>[];
}

/**
 * A same-id row already present locally is only flagged as a conflict when
 * its name differs from the incoming one — a same-id/same-name match is
 * treated as re-importing the same routine (e.g. onto the same device) and
 * is silently reused rather than surfaced to the user.
 */
export async function getRoutineImportConflicts(payload: RoutineSharePayload): Promise<RoutineImportConflicts> {
  const routineConflicts: RoutineImportConflict<Routine>[] = [];
  for (const incoming of payload.routines) {
    const existing = await getRoutineById(incoming.id);
    if (existing && existing.name !== incoming.name) routineConflicts.push({ incoming, existing });
  }
  const exerciseConflicts: RoutineImportConflict<Exercise>[] = [];
  for (const incoming of payload.exercises) {
    const existing = await getExerciseById(incoming.id);
    if (existing && existing.name !== incoming.name) exerciseConflicts.push({ incoming, existing });
  }
  return { routineConflicts, exerciseConflicts };
}

/**
 * Applies a routines-share payload. For each conflicting id (per
 * getRoutineImportConflicts), resolutions picks 'overwrite' (bulkPut over the
 * local row) or 'copy' (fresh uuid + "(imported)" suffix, leaving the local
 * row untouched). A conflict with no entry in resolutions defaults to 'copy'
 * — this never silently overwrites local data. Non-conflicting rows are
 * bulkPut as-is (bulkPut so re-running the same import is idempotent).
 * Copied exercise ids are remapped inside any routine's exerciseIds before
 * that routine is written, so a copied routine never points at the
 * overwritten/old exercise row.
 */
export async function importRoutines(
  payload: RoutineSharePayload,
  resolutions: Map<string, 'overwrite' | 'copy'> = new Map()
): Promise<void> {
  const idRemap = new Map<string, string>();

  const exercisesToPut: Exercise[] = [];
  for (const incoming of payload.exercises) {
    const existing = await getExerciseById(incoming.id);
    const conflicted = !!existing && existing.name !== incoming.name;
    const resolution = conflicted ? resolutions.get(incoming.id) ?? 'copy' : 'overwrite';
    if (resolution === 'copy') {
      const newId = crypto.randomUUID();
      idRemap.set(incoming.id, newId);
      exercisesToPut.push({ ...incoming, id: newId, name: `${incoming.name} (imported)` });
    } else {
      exercisesToPut.push(incoming);
    }
  }

  const routinesToPut: Routine[] = [];
  for (const incoming of payload.routines) {
    const exerciseIds = incoming.exerciseIds.map((id) => idRemap.get(id) ?? id);
    const existing = await getRoutineById(incoming.id);
    const conflicted = !!existing && existing.name !== incoming.name;
    const resolution = conflicted ? resolutions.get(incoming.id) ?? 'copy' : 'overwrite';
    if (resolution === 'copy') {
      routinesToPut.push({ ...incoming, id: crypto.randomUUID(), name: `${incoming.name} (imported)`, exerciseIds });
    } else {
      routinesToPut.push({ ...incoming, exerciseIds });
    }
  }

  await db.transaction('rw', db.routines, db.exercises, async () => {
    await db.exercises.bulkPut(exercisesToPut);
    await db.routines.bulkPut(routinesToPut);
  });
}

export default db;
