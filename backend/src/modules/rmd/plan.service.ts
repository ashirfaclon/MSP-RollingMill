/**
 * RMD production plan: the plant's month-wise plan for FY 2026-27, Prime + Short length,
 * on line + off line — the same measure as the Production · Prime + SL card. Spread to days
 * and halved between the two 12-hour shifts (Day 09–21, Night 21–09 IST).
 *
 * A month's daily plan = month ÷ its working days, with the shutdown days at 0. The plant
 * gives the number of working days but not which dates are the shutdown (Apr 2, Oct 2, Nov 1):
 * until those dates are listed in SHUTDOWN_DATES, such a month is spread over all its calendar
 * days, so the month still adds up to the plant's figure.
 *
 * Plan gap and compliance compare the plan with ERP Prime + SL only over the days that have
 * both (the ERP is entered a day or two late). Production per shift is not in the ERP: NA.
 */
import type { Env } from '../../config/env';
import type { RmdPlanDay, RmdPlanReport } from '../../contracts';
import { dateRange, round2 } from '../hsm/production.service';
import { rmdProductionByDay } from './production.service';
import { planSource, savedPlanDays, withSavedPlan } from '../forms-db/plan.store';
// TODO(plan-feature): HARDCODED — the RMD month-wise plan FY 2026-27 (Apr 2026 – Mar 2027, Prime +
// Short length, on line + off line, 142,240.9 MT) from the plant's Excel (RMD Month Wise production
// plan FY 26-27 (1).xlsx, shared 12 Oct 2026). Remove this import and plan/rmd-plan-2026-27.json
// once the plan-import feature supplies the plan.
import fy2026 from './plan/rmd-plan-2026-27.json';

/** One month of a plant plan: its total and how many of its days are worked. Shared with LSM. */
export interface PlanMonth { month: string; workingDays: number; calendarDays: number; planMt: number }

const MONTHS = new Map<string, PlanMonth>(fy2026.months.map((m) => [m.month, {
  month: m.month, workingDays: m.workingDays, calendarDays: m.calendarDays, planMt: m.primeSlMt,
}]));
export const RMD_PLAN_SOURCE = fy2026.source;

/** Shutdown dates (YYYY-MM-DD) once the plant gives them; a month's are used only when they account for all its non-working days. */
export const SHUTDOWN_DATES: string[] = [];

export const RMD_SHIFTS = ['Day', 'Night'] as const;

/** The plan for one date: month ÷ working days (0 on a listed shutdown), else month ÷ calendar days. */
export function planMtOn(date: string, months = MONTHS, shutdowns = SHUTDOWN_DATES): number | null {
  const m = months.get(date.slice(0, 7));
  if (!m) return null;
  const off = shutdowns.filter((d) => d.startsWith(m.month));
  const known = off.length === m.calendarDays - m.workingDays;
  if (known && off.includes(date)) return 0;
  return m.planMt / (known ? m.workingDays : m.calendarDays);
}

/** Each date's plan, halved per shift, beside its ERP production. */
export function rmdPlanDays(dates: string[], actual: Map<string, number | null>, months: Map<string, PlanMonth> = MONTHS): RmdPlanDay[] {
  return dates.map((date) => {
    const p = planMtOn(date, months, months === MONTHS ? SHUTDOWN_DATES : []);
    return {
      date,
      planMt: p === null ? null : round2(p),
      byShift: p === null ? {} : Object.fromEntries(RMD_SHIFTS.map((s) => [s, round2(p / RMD_SHIFTS.length)])),
      actualMt: actual.get(date) ?? null,
    };
  });
}

export function summarisePlan(days: RmdPlanDay[]): RmdPlanReport['totals'] {
  const planned = days.filter((d) => d.planMt !== null);
  const compared = planned.filter((d) => d.actualMt !== null);
  const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
  const planMt = planned.length ? sum(planned.map((d) => d.planMt!)) : null;
  const comparedPlanMt = compared.length ? sum(compared.map((d) => d.planMt!)) : null;
  // No plan for any day (e.g. a mill without one): the output is the ERP over the days entered.
  const counted = planned.length ? compared : days.filter((d) => d.actualMt !== null);
  const actualMt = counted.length ? sum(counted.map((d) => d.actualMt!)) : null;
  return {
    planMt,
    byShift: Object.fromEntries(RMD_SHIFTS.map((s) => [s, planned.length ? sum(planned.map((d) => d.byShift[s] ?? 0)) : null])),
    plannedDays: planned.length,
    days: days.length,
    comparedDays: compared.length,
    comparedPlanMt,
    actualMt,
    gapMt: comparedPlanMt !== null && actualMt !== null ? round2(actualMt - comparedPlanMt) : null,
    compliancePct: comparedPlanMt && actualMt !== null ? round2((actualMt / comparedPlanMt) * 100) : null,
  };
}

export async function rmdPlan(env: Env, from: string, to: string): Promise<RmdPlanReport> {
  const dates = dateRange(from, to);
  // The plan saved on the dashboard (logbook Production Plan) wins over the FY import, date by date.
  const saved = await savedPlanDays(env, 'rmd', from, to).catch(() => new Map());
  const days = withSavedPlan(rmdPlanDays(dates, rmdProductionByDay(env, dates)), saved);
  return { from, to, source: planSource(saved, RMD_PLAN_SOURCE), days, totals: summarisePlan(days) };
}
