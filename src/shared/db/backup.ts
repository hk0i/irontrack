import { db, type BackupPayload } from './schema';

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
