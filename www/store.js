// Small shared reactive singleton for cross-screen UI state that isn't
// persisted workout data (that all lives in db.js/IndexedDB). Currently just
// the preferred display unit, backed by localStorage.

const STORAGE_KEY = 'preferredUnit';

export const settings = Vue.reactive({
  preferredUnit: localStorage.getItem(STORAGE_KEY) || 'lbs',
});

export function setPreferredUnit(unit) {
  settings.preferredUnit = unit;
  localStorage.setItem(STORAGE_KEY, unit);
}
