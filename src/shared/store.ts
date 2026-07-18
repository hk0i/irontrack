// Small shared reactive singleton for cross-screen UI state that isn't
// persisted workout data (that all lives in db.js/IndexedDB). Preferred
// display units, backed by localStorage — mass (lbs/kg) applies to workout
// weights and mass-type body metrics; length (in/cm) applies to length-type
// body metrics (waist, arm size, etc).

import { reactive } from 'vue';
import type { WeightUnit, LengthUnit } from './db';

const STORAGE_KEY = 'preferredUnit';
const LENGTH_STORAGE_KEY = 'preferredLengthUnit';

interface Settings {
  preferredUnit: WeightUnit;
  preferredLengthUnit: LengthUnit;
}

export const settings: Settings = reactive({
  preferredUnit: (localStorage.getItem(STORAGE_KEY) as WeightUnit) || 'lbs',
  preferredLengthUnit: (localStorage.getItem(LENGTH_STORAGE_KEY) as LengthUnit) || 'in',
});

export function setPreferredUnit(unit: WeightUnit): void {
  settings.preferredUnit = unit;
  localStorage.setItem(STORAGE_KEY, unit);
}

export function setPreferredLengthUnit(unit: LengthUnit): void {
  settings.preferredLengthUnit = unit;
  localStorage.setItem(LENGTH_STORAGE_KEY, unit);
}
