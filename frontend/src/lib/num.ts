/**
 * Fixed-decimal number formatting for the rolling-mill screens (ported from pellet-frontend).
 *
 * A locale formatter that drops the decimal on a whole number, which is right for a production
 * tonnage but wrong on an instrument panel: 48.0 TPH printed as "48" beside 43.1 TPH, and
 * a +1.0 % auxiliary overshoot as "+1", read as coarser measurements rather than as the
 * same measurement to the same precision. Here the decimal places are the caller's choice
 * and are always honoured.
 */

export function fixed(v: number | null | undefined, dp = 1): string {
  return v === null || v === undefined
    ? 'NA'
    : v.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Same, with an explicit + on positives — for gaps, deviations and variances. */
export function fixedSigned(v: number | null | undefined, dp = 1): string {
  return v === null || v === undefined ? 'NA' : `${v > 0 ? '+' : ''}${fixed(v, dp)}`;
}

/**
 * A chart axis's floor: 0, unless a value is below zero — then the next round `step` under the
 * lowest value, so a negative reading (a motor current going below zero) is drawn, not cut off
 * at the axis (the user, 30 Oct 2026).
 */
export function axisFloor(values: (number | null | undefined)[], step = 10): number {
  let low = 0;
  for (const v of values) if (typeof v === 'number' && Number.isFinite(v) && v < low) low = v;
  return low < 0 ? Math.floor(low / step) * step : 0;
}
