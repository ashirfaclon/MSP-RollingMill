/**
 * RMD production plan: target MT per day and shift (Prime + Short length, the Production · Prime + SL
 * card's measure) from the logbook Production Plan form (RMD ROLLING PLAN), saved on the dashboard
 * (Edit plan) — the only source (the user, 31 Oct 2026; the FY 2026-27 Excel plan was moved into the
 * form). A date with no entry has no plan.
 *
 * Plan gap and compliance compare the plan with ERP Prime + SL only over the days that have
 * both (the ERP is entered a day or two late). Production per shift is not in the ERP: NA.
 *
 * Online / Offline: that rolling's plan against its production; Both: Online + Offline (plan.store.ts;
 * the user, 13 Nov 2026).
 */
import type { Env } from '../../config/env';
import type { RmdMode, RmdPlanDay, RmdPlanReport } from '../../contracts';
import { dateRange, round2 } from '../hsm/production.service';
import { rmdProductionByDay } from './production.service';
import { planSource, savedPlanDays, unplannedDays, withSavedPlan } from '../forms-db/plan.store';

export const RMD_SHIFTS = ['Day', 'Night'] as const;

/** Each date's plan from the logbook, beside its ERP production. Shared with LSM and RMS. */
export function planDaysFrom(dates: string[], actual: Map<string, number | null>, saved: Parameters<typeof withSavedPlan>[1]): RmdPlanDay[] {
  return withSavedPlan(unplannedDays(dates), saved).map((d) => ({ ...d, actualMt: actual.get(d.date) ?? null }));
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

export async function rmdPlan(env: Env, from: string, to: string, mode: RmdMode = 'all'): Promise<RmdPlanReport> {
  const dates = dateRange(from, to);
  // The plan: the logbook Production Plan form.
  const saved = await savedPlanDays(env, 'rmd', from, to, mode).catch(() => new Map());
  const days = planDaysFrom(dates, rmdProductionByDay(env, dates, mode), saved);
  return { from, to, source: planSource(saved), days, totals: summarisePlan(days) };
}
