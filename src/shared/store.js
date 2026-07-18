// Small shared reactive singleton for cross-screen UI state that isn't
// persisted workout data (that all lives in db.js/IndexedDB). Preferred
// display units, backed by localStorage — mass (lbs/kg) applies to workout
// weights and mass-type body metrics; length (in/cm) applies to length-type
// body metrics (waist, arm size, etc).

import { reactive } from 'vue';

const STORAGE_KEY = 'preferredUnit';
const LENGTH_STORAGE_KEY = 'preferredLengthUnit';

export const settings = reactive({
  preferredUnit: localStorage.getItem(STORAGE_KEY) || 'lbs',
  preferredLengthUnit: localStorage.getItem(LENGTH_STORAGE_KEY) || 'in',
});

export function setPreferredUnit(unit) {
  settings.preferredUnit = unit;
  localStorage.setItem(STORAGE_KEY, unit);
}

export function setPreferredLengthUnit(unit) {
  settings.preferredLengthUnit = unit;
  localStorage.setItem(LENGTH_STORAGE_KEY, unit);
}
