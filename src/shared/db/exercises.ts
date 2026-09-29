import { db, type Exercise, type ResistanceType, type ExerciseType } from './schema';

export async function createExercise({
  name,
  resistanceType = 'weight',
  exerciseType = 'regular',
}: {
  name: string;
  resistanceType?: ResistanceType;
  exerciseType?: ExerciseType;
}): Promise<Exercise> {
  const exercise: Exercise = { id: crypto.randomUUID(), name, resistanceType, exerciseType };
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

/** Reuses an existing group if exactly one is found among the selection (so "add C to A+B" works naturally); otherwise mints a fresh groupId. No-ops below 2 ids. */
export async function setExerciseGroup(exerciseIds: string[]): Promise<string | null> {
  if (exerciseIds.length < 2) return null;
  return db.transaction('rw', db.exercises, async () => {
    const existing = await Promise.all(exerciseIds.map((id) => db.exercises.get(id)));
    const priorGroupIds = new Set(existing.filter((e) => e?.groupId).map((e) => e!.groupId as string));
    const groupId = priorGroupIds.size === 1 ? [...priorGroupIds][0] : crypto.randomUUID();
    await Promise.all(exerciseIds.map((id) => db.exercises.update(id, { groupId })));
    await pruneOrphanGroups([...priorGroupIds].filter((g) => g !== groupId));
    return groupId;
  });
}

/** Dissolves the group if this leaves only 1 member — a groupId is never held by fewer than 2. */
export async function removeFromGroup(exerciseId: string): Promise<void> {
  await db.transaction('rw', db.exercises, async () => {
    const exercise = await db.exercises.get(exerciseId);
    if (!exercise?.groupId) return;
    const groupId = exercise.groupId;
    await db.exercises.update(exerciseId, { groupId: null });
    await pruneOrphanGroups([groupId]);
  });
}

async function pruneOrphanGroups(groupIds: string[]): Promise<void> {
  for (const groupId of groupIds) {
    const members = await db.exercises.where('groupId').equals(groupId).toArray();
    if (members.length === 1) {
      await db.exercises.update(members[0].id, { groupId: null });
    }
  }
}
