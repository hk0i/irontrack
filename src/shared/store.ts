/**
 * Small shared reactive singleton for cross-screen UI state that isn't
 * persisted workout data (that all lives in db.js/IndexedDB). Preferred
 * display units, backed by localStorage — mass (lbs/kg) applies to workout
 * weights and mass-type body metrics; length (in/cm) applies to length-type
 * body metrics (waist, arm size, etc).
 */

import { reactive } from 'vue';
import type { WeightUnit, LengthUnit } from './db';

const STORAGE_KEY = 'preferredUnit';
const LENGTH_STORAGE_KEY = 'preferredLengthUnit';
const THEME_STORAGE_KEY = 'theme';
const WARMUP_REST_STORAGE_KEY = 'warmupRestSeconds';
const REGULAR_REST_STORAGE_KEY = 'regularRestSeconds';
const DEFAULT_WARMUP_REST_SECONDS = 30;
const DEFAULT_REGULAR_REST_SECONDS = 90;

/**
 * 'irontrack' is the app's original color scheme; 'onebigfunction' is the
 * platform-wide design system (see style.css's [data-theme] block for the
 * actual token values each one maps to).
 */
export type Theme = 'irontrack' | 'onebigfunction';

interface Settings {
  preferredUnit: WeightUnit;
  preferredLengthUnit: LengthUnit;
  theme: Theme;
  warmupRestSeconds: number;
  regularRestSeconds: number;
}

function loadTheme(): Theme {
  return (localStorage.getItem(THEME_STORAGE_KEY) as Theme) || 'irontrack';
}

/**
 * Existing settings read straight off localStorage as strings/enums; these
 * are numbers, so parse and fall back to the default when missing or
 * garbage (localStorage.getItem returns null when absent, Number(null) is
 * 0 — the `> 0` check catches that case too, not just NaN).
 */
function loadRestSeconds(key: string, fallback: number): number {
  const stored = Number(localStorage.getItem(key));
  return Number.isFinite(stored) && stored > 0 ? stored : fallback;
}

export const settings: Settings = reactive({
  preferredUnit: (localStorage.getItem(STORAGE_KEY) as WeightUnit) || 'lbs',
  preferredLengthUnit: (localStorage.getItem(LENGTH_STORAGE_KEY) as LengthUnit) || 'in',
  theme: loadTheme(),
  warmupRestSeconds: loadRestSeconds(WARMUP_REST_STORAGE_KEY, DEFAULT_WARMUP_REST_SECONDS),
  regularRestSeconds: loadRestSeconds(REGULAR_REST_STORAGE_KEY, DEFAULT_REGULAR_REST_SECONDS),
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

export function setWarmupRestSeconds(seconds: number): void {
  settings.warmupRestSeconds = seconds;
  localStorage.setItem(WARMUP_REST_STORAGE_KEY, String(seconds));
}

export function setRegularRestSeconds(seconds: number): void {
  settings.regularRestSeconds = seconds;
  localStorage.setItem(REGULAR_REST_STORAGE_KEY, String(seconds));
}
