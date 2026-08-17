import { db, type SetEntry, type WeightUnit } from './schema';
import { kgToLbs } from './units';

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

export interface SessionVolumePoint {
  date: string;
  volume: number;
}

/**
 * Total volume (sum of weightInLbs * reps across all sets) for the last
 * `limit` sessions of one routine, up to and including uptoDate — feeds the
 * small trend sparkline on WorkoutSessionDetailScreen. Single getAllSets()
 * scan, grouped by sessionId (or legacy date, matching the same fallback
 * WorkoutHistoryScreen's grouping already uses for pre-sessionId sets).
 * Bodyweight/mobility sets contribute 0 (weightInLbs is 0), a deliberate
 * simplification rather than a true estimated-volume formula.
 */
export async function getRecentSessionVolumesForRoutine(routineId: string, uptoDate: string, limit = 8): Promise<SessionVolumePoint[]> {
  const sets = await getAllSets();
  const bySession = new Map<string, SessionVolumePoint>();
  for (const set of sets) {
    if ((set.routineId || null) !== routineId || set.date > uptoDate) continue;
    const key = set.sessionId || `legacy::${set.date}`;
    if (!bySession.has(key)) bySession.set(key, { date: set.date, volume: 0 });
    bySession.get(key)!.volume += set.weightInLbs * set.reps;
  }
  return [...bySession.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-limit);
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
