/**
 * RMS production plan: target MT per day and shift (the Production card's measure, PRODUCTION_MT)
 * from the logbook Production Plan form (RMS ROLLING PLAN), saved on the dashboard (Edit plan) — the
 * only source (the user, 31 Oct 2026; the April–October 2026 Excel plans were moved into the form).
 * A date with no entry has no plan. Plan gap and compliance compare only the days with ERP production.
 *
 * Output per shift: the ERP day split by the shifts' prime pieces in the logbook's RMS Production
 * Sheet (Rolling Mill Structure (RMS) → RMS Production Sheet → PRODUCTION SHEET; the user,
 * 16 Oct 2026), the same way as LSM: Day MT = PRODUCTION_MT × Day prime pcs ÷ (Day + Night).
 */
import type { Env } from '../../config/env';
import type { LsmPlanReport } from '../../contracts';
import { planWithShifts } from '../lsm/plan.service';
import { rmsProductionByDay } from './production.service';

export const RMS_SHEET_FORM = 'rms-production-sheet/production-sheet';

export function rmsPlan(env: Env, from: string, to: string): Promise<LsmPlanReport> {
  return planWithShifts(env, from, to, { actual: (dates) => rmsProductionByDay(env, dates), form: RMS_SHEET_FORM, mill: 'rms' });
}
