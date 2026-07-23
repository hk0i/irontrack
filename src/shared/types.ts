import type { WeightUnit } from './db';

export type ScreenName =
  | 'dashboard'
  | 'settings'
  | 'routine-builder'
  | 'active-workout'
  | 'workout-history'
  | 'body-metrics'
  | 'progress-chart';

// Every screen's loose `navParams` prop, today a runtime `Object` with no
// checked shape. Both fields are optional because most screens receive an
// empty object — only RoutineBuilder/ActiveWorkout read routineId, only
// ProgressChart reads initialExerciseId.
export interface NavParams {
  routineId?: string;
  initialExerciseId?: string;
}

// The reactive per-set row object ActiveWorkoutScreen's makeEmptyRow()
// creates and SetRow.vue renders — shared because both files need the exact
// same shape and SetRow has no independent reason to define its own.
export interface SetRowState {
  weightEntered: string;
  reps: string;
  unit: WeightUnit;
  // Only meaningful when the exercise's resistanceType is 'bands' — more
  // than one band can be stacked per set, so this is an array, not a
  // single color.
  bandColors: string[];
  checked: boolean;
  weightInvalid: boolean;
  repsInvalid: boolean;
  loggedSetId: string | null;
}
