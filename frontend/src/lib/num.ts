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
