/**
 * HSM production plan: target MT per day and shift from the logbook Production Plan form (HSM ROLLING
 * PLAN), saved on the dashboard (Edit plan) — the only source (the user, 31 Oct 2026; the October 2026
 * Excel tracker was moved into the form). A date with no entry has no plan.
 *
 * Shifts are taken exactly as saved (the mill runs one shift for about 15 days, then the other).
 * Plan gap compares the plan with production (the Production card's Total) over the planned days
 * only, so a period running past the planned days is not compared unfairly.
 */
import type { Env } from '../../config/env';
import type { PlanDay, PlanReport } from '../../contracts';
import { dateRange, productionComparison, round2 } from './production.service';
import { SHIFTS, productionTicks, splitByShift } from './shift-split';
import { planSource, savedPlanDays, unplannedDays, withSavedPlan } from '../forms-db/plan.store';

const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));

export async function planReport(env: Env, from: string, to: string, nowMs = Date.now()): Promise<PlanReport> {
  const dates = dateRange(from, to);
  const [prod, ticks, saved] = await Promise.all([
    productionComparison(env, from, to, 'day', nowMs).catch(() => null),
    productionTicks(env, from, to, nowMs).catch(() => null),
    // The plan: the logbook Production Plan form.
    savedPlanDays(env, 'hsm', from, to).catch(() => new Map()),
  ]);
  const actualByDay = new Map((prod?.days ?? []).map((d) => [d.date, d.influxMt]));
  const split = splitByShift(ticks ?? [], new Map(dates.map((d) => [d, ticks ? actualByDay.get(d) ?? null : null])));
  const days: PlanDay[] = withSavedPlan(unplannedDays(dates), saved).map((d) => ({
    ...d, actualMt: actualByDay.get(d.date) ?? null, actualByShift: split.get(d.date) ?? null,
  }));
  const actualByShift: Record<string, number> = Object.fromEntries(SHIFTS.map((s) => [s, 0]));
  for (const d of days) for (const s of SHIFTS) actualByShift[s] = round2(actualByShift[s] + (d.actualByShift?.[s] ?? 0));

  const planned = days.filter((d) => d.planMt !== null);
  const byShift: Record<string, number> = {};
  for (const d of planned) for (const [k, v] of Object.entries(d.byShift)) byShift[k] = round2((byShift[k] ?? 0) + v);
  const planMt = planned.length ? sum(planned.map((d) => d.planMt!)) : null;
  const actuals = planned.map((d) => d.actualMt);
  const actualMt = planned.length && actuals.every((a) => a !== null) ? sum(actuals as number[]) : null;
  return {
    from, to, source: planSource(saved), days,
    totals: {
      planMt, byShift, plannedDays: planned.length, days: days.length, actualMt,
      gapMt: planMt !== null && actualMt !== null ? round2(actualMt - planMt) : null,
      actualByShift,
    },
  };
}
