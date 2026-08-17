import { db, type MetricBlueprint, type MetricType, type Unit, type MetricLog } from './schema';
import { kgToLbs, cmToIn } from './units';

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
