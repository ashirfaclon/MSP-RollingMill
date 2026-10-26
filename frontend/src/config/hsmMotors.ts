/**
 * HSM stand DC motors — rated current (A), from the plant's Strip_Mill_DC_Motor_Details.xlsx
 * (26 Oct 2026): Roughing R1–R5 Revpower, Finishing F1–F6 CG. The stand names are the Mill Load
 * Log Sheet's (RM n, FM n). Motor current loading % = load ÷ rated current × 100.
 */
export const HSM_RATED_CURRENT_A: Record<string, number> = {
  'RM 1': 630, 'RM 2': 630, 'RM 3': 872, 'RM 4': 872, 'RM 5': 983,
  'FM 1': 1214, 'FM 2': 1214, 'FM 3': 1807, 'FM 4': 1807, 'FM 5': 1807, 'FM 6': 1807,
};

/** A stand's loading %, or null without its load or rated current. */
export function loadingPct(stand: string, loadA: number | null): number | null {
  const rated = HSM_RATED_CURRENT_A[stand];
  return loadA === null || !rated ? null : (loadA / rated) * 100;
}
