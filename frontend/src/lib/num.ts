/**
 * Number formatting for the rolling-mill screens. One rule everywhere (the user, 24 Nov 2026): up to
 * 2 decimal places, and only the ones a value needs — 8,511.43, 92.3, 100, 9,638.64 — never a
 * trailing zero, never a figure rounded to a whole number. `dp` above 2 keeps that many at most
 * (chemistry: 0.075). `dp` is kept for callers; at 2 or less it no longer changes anything.
 */
export const decimals = (dp = 2): Intl.NumberFormatOptions => ({ minimumFractionDigits: 0, maximumFractionDigits: Math.max(2, dp) });

/** A number as the dashboard writes it (see above), en-IN grouping. */
export const num = (v: number, dp = 2) => v.toLocaleString('en-IN', decimals(dp));

export function fixed(v: number | null | undefined, dp = 2): string {
  return v === null || v === undefined ? 'NA' : num(v, dp);
}

/** Same, with an explicit + on positives — for gaps, deviations and variances. */
export function fixedSigned(v: number | null | undefined, dp = 2): string {
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
