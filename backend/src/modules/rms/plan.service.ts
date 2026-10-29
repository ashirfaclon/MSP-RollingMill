/**
 * RMS production plan: the plant's monthly plans for April–October 2026 (RMS_Production_Plan.zip,
 * one workbook per month, TOTAL PRODUCTION in finished MT) — the same measure as the Production
 * card (PRODUCTION_MT). As RMD's: a month's plan is spread over its calendar days (the shutdown
 * dates are not given) and halved between the two 12-hour shifts (Day 09:30–21:30, Night
 * 21:30–09:30 IST). Plan gap and compliance compare only the days with ERP production.
 *
 * Output per shift: the ERP day split by the shifts' prime pieces in the logbook's RMS Production
 * Sheet (Rolling Mill Structure (RMS) → RMS Production Sheet → PRODUCTION SHEET; the user,
 * 16 Oct 2026), the same way as LSM: Day MT = PRODUCTION_MT × Day prime pcs ÷ (Day + Night).
 */
import type { Env } from '../../config/env';
import type { LsmPlanReport } from '../../contracts';
import type { PlanMonth } from '../rmd/plan.service';
import { planWithShifts } from '../lsm/plan.service';
import { rmsProductionByDay } from './production.service';
// TODO(plan-feature): HARDCODED — the RMS monthly plans April–October 2026 from the plant's
// RMS_Production_Plan.zip (shared 16 Oct 2026). Remove this import and plan/rms-plan-2026.json
// once the plan-import feature supplies the plan.
import plan2026 from './plan/rms-plan-2026.json';

export const RMS_SHEET_FORM = 'rms-production-sheet/production-sheet';

const MONTHS = new Map<string, PlanMonth>(plan2026.months.map((m) => [m.month, {
  month: m.month, workingDays: m.workingDays, calendarDays: m.calendarDays, planMt: m.productionMt,
}]));

export function rmsPlan(env: Env, from: string, to: string): Promise<LsmPlanReport> {
  return planWithShifts(env, from, to, { months: MONTHS, actual: (dates) => rmsProductionByDay(env, dates), form: RMS_SHEET_FORM, source: plan2026.source, mill: 'rms' });
}
