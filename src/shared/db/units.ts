import type { WeightUnit, MetricType, Unit } from './schema';

const KG_TO_LBS = 2.20462262;
const CM_TO_IN = 0.39370078;

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
