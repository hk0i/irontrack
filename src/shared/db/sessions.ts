import { db, type WorkoutSession, type SetEntry } from './schema';
import { getAllSets } from './sets';

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
