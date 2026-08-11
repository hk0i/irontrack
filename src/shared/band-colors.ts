/**
 * Theraband's standard resistance-band color progression (light to heavy).
 * Colors only for v1 — no numeric resistance value per user's call.
 * Customizable catalogs/other brands are a future extension, not this pass.
 */
export const THERABAND_COLORS: string[] = ['Yellow', 'Red', 'Green', 'Blue', 'Black', 'Silver', 'Gold'];

/**
 * Approximate average resistance in lbs per Thera-Band's published chart
 * (light to heavy, same order as THERABAND_COLORS). Used only to give the
 * volume metric a real load figure for banded sets — not a per-user
 * calibrated number, so treat it as a reasonable estimate for trend
 * purposes, not an exact figure.
 */
const THERABAND_RESISTANCE_LBS: Record<string, number> = {
  Yellow: 3.0,
  Red: 3.5,
  Green: 4.0,
  Blue: 5.5,
  Black: 6.5,
  Silver: 8.0,
  Gold: 10.0,
};

/**
 * Stacked bands add resistance, so this sums every color logged on a set.
 * Unrecognized colors (shouldn't happen — colors always come from
 * THERABAND_COLORS via BandColorPicker) contribute 0 rather than throwing.
 */
export function sumBandResistanceLbs(colors: string[]): number {
  return colors.reduce((sum, color) => sum + (THERABAND_RESISTANCE_LBS[color] ?? 0), 0);
}
