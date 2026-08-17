// Separate from backup.ts: this payload never touches sets, workouts, or
// body-metric data, so sharing a routine can't leak personal training history.

import { db, type Routine, type Exercise } from './schema';
import { getRoutineById } from './routines';
import { getExerciseById } from './exercises';

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
