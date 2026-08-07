// Aggregates SetEntry rows (one row per logged set) into one point per
// calendar date, for the progress chart.
import type { Exercise, MetricLog, SetEntry } from './db';
import { sumBandResistanceLbs } from './band-colors';

export interface DailyProgressPoint {
  date: string;
  weight: number;
  volume: number;
}

// The body weight in effect on a given day — the most recent log dated on
// or before it, NOT today's weight. Without this, a historical set's volume
// would keep changing every time the user logs a new body weight (e.g. 3
// sets of pushups done at 160 lbs would silently start reporting at 175 lbs
// once that's logged). bodyWeightLogs must be sorted ascending by date.
// null when nothing was logged on or before that date yet.
function bodyWeightLbsAsOf(bodyWeightLogs: MetricLog[], date: string): number | null {
  let result: number | null = null;
  for (const log of bodyWeightLogs) {
    if (log.date > date) break;
    result = log.valueBaseline;
  }
  return result;
}

// Volume load per resistanceType — reps x resistance whenever a real
// resistance figure is knowable, raw reps otherwise:
//  - weight: reps x the weight actually entered.
//  - bands: reps x the summed resistance of every color on the set, or
//    just reps if no colors were logged (no fabricated load — matches
//    bodyweight below, e.g. historical sets logged before band tracking).
//  - bodyweight: reps x the body weight logged as of that set's date, or
//    just reps if none was logged yet (no fabricated load).
//  - mobility: always just reps — no load, by definition, so it never gets
//    multiplied by anything (keeps mobility drills like cat-cow from
//    inheriting a bodyweight multiplier they don't represent).
export function computeSetVolume(set: SetEntry, resistanceType: Exercise['resistanceType'], bodyWeightLbs: number | null): number {
  switch (resistanceType) {
    case 'bands': {
      const bandColors = set.bandColors ?? [];
      return bandColors.length === 0 ? set.reps : set.reps * sumBandResistanceLbs(bandColors);
    }
    case 'bodyweight':
      return bodyWeightLbs === null ? set.reps : set.reps * bodyWeightLbs;
    case 'mobility':
      return set.reps;
    case 'weight':
    default:
      return set.reps * set.weightInLbs;
  }
}

export function aggregateSetsByDay(sets: SetEntry[], exercisesById: Map<string, Exercise>, bodyWeightLogs: MetricLog[]): DailyProgressPoint[] {
  const byDate = new Map<string, SetEntry[]>();
  for (const set of sets) {
    const existing = byDate.get(set.date);
    if (existing) {
      existing.push(set);
    } else {
      byDate.set(set.date, [set]);
    }
  }

  const points: DailyProgressPoint[] = [];
  for (const [date, daySets] of byDate) {
    const bodyWeightLbs = bodyWeightLbsAsOf(bodyWeightLogs, date);
    points.push({
      date,
      weight: Math.max(...daySets.map((s) => s.weightInLbs)),
      volume: daySets.reduce((sum, s) => {
        const resistanceType = exercisesById.get(s.exerciseId)?.resistanceType ?? 'weight';
        return sum + computeSetVolume(s, resistanceType, bodyWeightLbs);
      }, 0),
    });
  }

  return points.sort((a, b) => a.date.localeCompare(b.date));
}
