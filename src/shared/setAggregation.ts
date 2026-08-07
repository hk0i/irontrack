// Aggregates SetEntry rows (one row per logged set) into one point per
// calendar date, for the progress chart. Pure, dependency-free — no db
// import — so it stays easy to reason about and reuse.
import type { SetEntry } from './db';

export interface DailyProgressPoint {
  date: string;
  weight: number;
  volume: number;
}

// Same formula for every resistanceType (weight/bodyweight/bands) — no
// branching. Flooring the weight factor at 1 lets a 0 lbs bodyweight/band
// set still contribute `reps` to volume instead of zeroing it out, while
// loaded sets behave as ordinary reps x weight.
export function computeSetVolume(set: SetEntry): number {
  return set.reps * Math.max(set.weightInLbs, 1);
}

export function aggregateSetsByDay(sets: SetEntry[]): DailyProgressPoint[] {
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
    points.push({
      date,
      weight: Math.max(...daySets.map((s) => s.weightInLbs)),
      volume: daySets.reduce((sum, s) => sum + computeSetVolume(s), 0),
    });
  }

  return points.sort((a, b) => a.date.localeCompare(b.date));
}
