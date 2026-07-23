// Small shared reactive singleton for cross-screen UI state that isn't
// persisted workout data (that all lives in db.js/IndexedDB). Preferred
// display units, backed by localStorage — mass (lbs/kg) applies to workout
// weights and mass-type body metrics; length (in/cm) applies to length-type
// body metrics (waist, arm size, etc).

import { reactive } from 'vue';
import type { WeightUnit, LengthUnit } from './db';

const STORAGE_KEY = 'preferredUnit';
const LENGTH_STORAGE_KEY = 'preferredLengthUnit';
const THEME_STORAGE_KEY = 'theme';

// 'irontrack' is the app's original color scheme; 'onebigfunction' is the
// platform-wide design system (see style.css's [data-theme] block for the
// actual token values each one maps to).
export type Theme = 'irontrack' | 'onebigfunction';

interface Settings {
  preferredUnit: WeightUnit;
  preferredLengthUnit: LengthUnit;
  theme: Theme;
}

function loadTheme(): Theme {
  return (localStorage.getItem(THEME_STORAGE_KEY) as Theme) || 'irontrack';
}

export const settings: Settings = reactive({
  preferredUnit: (localStorage.getItem(STORAGE_KEY) as WeightUnit) || 'lbs',
  preferredLengthUnit: (localStorage.getItem(LENGTH_STORAGE_KEY) as LengthUnit) || 'in',
  theme: loadTheme(),
});

// Applied once at module load (not just on setTheme) so a reload lands on
// the previously chosen theme's colors from the very first paint, rather
// than flashing the default before Settings mounts.
document.documentElement.setAttribute('data-theme', settings.theme);

export function setPreferredUnit(unit: WeightUnit): void {
  settings.preferredUnit = unit;
  localStorage.setItem(STORAGE_KEY, unit);
}

export function setPreferredLengthUnit(unit: LengthUnit): void {
  settings.preferredLengthUnit = unit;
  localStorage.setItem(LENGTH_STORAGE_KEY, unit);
}

export function setTheme(theme: Theme): void {
  settings.theme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  document.documentElement.setAttribute('data-theme', theme);
}
