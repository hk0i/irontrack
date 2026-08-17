/**
 * Dexie schema + all cross-domain types.
 * No other file should touch db.routines / db.exercises / db.sets directly —
 * this keeps "weightInLbs is the only source of truth" invariant in one place.
 */

import Dexie, { type Table } from 'dexie';

export type WeightUnit = 'lbs' | 'kg';
export type LengthUnit = 'in' | 'cm';
export type Unit = WeightUnit | LengthUnit;
export type MetricType = 'mass' | 'length';
export type ResistanceType = 'bodyweight' | 'bands' | 'weight' | 'mobility';

/**
 * Display metadata for every picker that lets a user set an exercise's
 * resistance type at creation time (RoutineBuilderScreen, ActiveWorkoutScreen's
 * ad-hoc add panel).
 */
export const RESISTANCE_TYPES: { value: ResistanceType; label: string }[] = [
  { value: 'weight', label: 'Weight' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'bands', label: 'Bands' },
  { value: 'mobility', label: 'Mobility' },
];

export type ExerciseType = 'warmup' | 'regular';

/**
 * Display metadata for every picker that lets a user set an exercise's
 * type at creation time (RoutineBuilderScreen) or edit it after
 * (RoutineBuilderScreen's per-row cycle select). Drives which of
 * Settings' two rest-duration defaults ActiveWorkoutScreen uses.
 */
export const EXERCISE_TYPES: { value: ExerciseType; label: string }[] = [
  { value: 'regular', label: 'Regular' },
  { value: 'warmup', label: 'Warmup' },
];

export interface Routine {
  id: string;
  name: string;
  exerciseIds: string[];
  /** Dashboard display order. Missing on routines created before manual
   * reordering existed — getAllRoutines treats that as 0, sorting them
   * ahead of any dated routine. */
  sortOrder?: number;
}

export interface Exercise {
  id: string;
  name: string;
  supersetWith: string | null;
  /**
   * Optional — exercises created before this field existed have no key at
   * all, not just a falsy value. Every read site must fall back to
   * 'weight' (the prior implicit behavior) rather than assume presence.
   */
  resistanceType?: ResistanceType;
  /**
   * Optional — exercises created before this field existed have no key at
   * all. Every read site must fall back to 'regular' (the prior implicit
   * flat-90s rest behavior), never silently treat an absent value as
   * 'warmup'.
   */
  exerciseType?: ExerciseType;
}

export interface SetEntry {
  id: string;
  exerciseId: string;
  date: string;
  reps: number;
  weightEntered: number;
  unit: WeightUnit;
  weightInLbs: number;
  routineId: string | null;
  sessionId: string | null;
  createdAt: number;
  /**
   * Only meaningful for band-resistance exercises — plain field, not
   * indexed, so no Dexie version bump needed (same pattern as routineId).
   * Optional: sets logged before this field existed have no key at all.
   */
  bandColors?: string[];
}

export interface WorkoutSession {
  id: string;
  routineId: string;
  date: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  /**
   * Optional — an emoji (preset or freely typed) the user picked when
   * finishing this workout. Plain field, not indexed, so no Dexie version
   * bump needed (same pattern as SetEntry.bandColors). Sessions logged
   * before this field existed have no key at all.
   */
  mood?: string;
  /**
   * Optional free-text note captured at finish time, same optionality and
   * versioning story as `mood`.
   */
  note?: string;
}

export interface MetricBlueprint {
  id: string;
  name: string;
  type: MetricType;
}

export interface MetricLog {
  id: string;
  blueprintId: string;
  date: string;
  valueEntered: number;
  unit: Unit;
  valueBaseline: number;
}

export interface BackupPayload {
  version: number;
  exportedAt: string;
  routines: Routine[];
  exercises: Exercise[];
  sets: SetEntry[];
  metricBlueprints?: MetricBlueprint[];
  metricLogs?: MetricLog[];
  workouts?: WorkoutSession[];
}

class IronTrackDB extends Dexie {
  routines!: Table<Routine, string>;
  exercises!: Table<Exercise, string>;
  sets!: Table<SetEntry, string>;
  metric_blueprints!: Table<MetricBlueprint, string>;
  metric_logs!: Table<MetricLog, string>;
  workouts!: Table<WorkoutSession, string>;

  constructor() {
    super('IronTrackDB');

    this.version(1).stores({
      routines: 'id, name',
      exercises: 'id, name, supersetWith',
      sets: 'id, exerciseId, date, weightInLbs',
    });

    // Only new tables need to be listed here — Dexie carries forward any
    // table not mentioned in a later version() call unchanged, so this
    // doesn't touch existing routines/exercises/sets data or require a
    // migration step.
    this.version(2).stores({
      metric_blueprints: 'id, name',
      metric_logs: 'id, blueprintId, date',
    });

    this.version(3).stores({
      workouts: 'id, routineId, date',
    });
  }
}

export const db = new IronTrackDB();
