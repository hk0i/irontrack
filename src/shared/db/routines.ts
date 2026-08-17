import { db, type Routine, type Exercise } from './schema';
import { getExerciseById } from './exercises';

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
