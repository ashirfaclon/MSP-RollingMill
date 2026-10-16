/**
 * The rolling plan: target MT per day, size and shift, as the plant fills it in (a week's
 * plan arrives before the previous week ends). TEMPORARY SOURCE: a static import of the
 * plant's Excel tracker (scripts/import-rolling-plan.py → plan/rolling-plan-<month>.json),
 * until the plan-import feature replaces it. Only this file reads it.
 *
 * Shifts are taken exactly as written (the mill runs one shift for about 15 days, then the
 * other). Plan gap compares the plan with production (the Production card's Total) over the
 * planned days only, so a period running past the planned week is not compared unfairly.
 */
import type { Env } from '../../config/env';
import type { PlanDay, PlanReport } from '../../contracts';
// TODO(plan-feature): HARDCODED — the October 2026 plan (1–18 Oct, 104 rows, 3,420 MT) from the
// plant's Excel (Daily_Rolling_Tracker_Oct2026 updated new.xlsx, shared 16 Oct 2026). Remove this
// import, plan/rolling-plan-2026-10.json and scripts/import-rolling-plan.py once the
// plan-import feature supplies the plan.
import october2026 from './plan/rolling-plan-2026-10.json';
import { dateRange, productionComparison, round2 } from './production.service';
import { SHIFTS, productionTicks, splitByShift } from './shift-split';

interface PlanRow { date: string; shift: string; thicknessMm: number | null; widthMm: number | null; mt: number }
interface PlanFile { month: string; source: string; rows: PlanRow[] }

/** Every imported month. Add the next month's file here (until the import feature exists). */
const PLANS: PlanFile[] = [october2026 as PlanFile];
const ROWS: PlanRow[] = PLANS.flatMap((p) => p.rows);
const SOURCE = PLANS.map((p) => p.source).join(' · ');

const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));

/** Targets per day and shift for plan dates `from`..`to`. Pure. */
export function planDays(dates: string[], rows: PlanRow[] = ROWS): Omit<PlanDay, 'actualMt' | 'actualByShift'>[] {
  return dates.map((date) => {
    const rs = rows.filter((r) => r.date === date);
    const byShift: Record<string, number> = {};
    for (const r of rs) {
      const shift = r.shift || '—';
      byShift[shift] = round2((byShift[shift] ?? 0) + r.mt);
    }
    return { date, planMt: rs.length ? sum(rs.map((r) => r.mt)) : null, byShift };
  });
}

export async function planReport(env: Env, from: string, to: string, nowMs = Date.now()): Promise<PlanReport> {
  const dates = dateRange(from, to);
  const [prod, ticks] = await Promise.all([
    productionComparison(env, from, to, 'day', nowMs).catch(() => null),
    productionTicks(env, from, to, nowMs).catch(() => null),
  ]);
  const actualByDay = new Map((prod?.days ?? []).map((d) => [d.date, d.influxMt]));
  const split = splitByShift(ticks ?? [], new Map(dates.map((d) => [d, ticks ? actualByDay.get(d) ?? null : null])));
  const days: PlanDay[] = planDays(dates).map((d) => ({
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
    from, to, source: SOURCE, days,
    totals: {
      planMt, byShift, plannedDays: planned.length, days: days.length, actualMt,
      gapMt: planMt !== null && actualMt !== null ? round2(planMt - actualMt) : null,
      actualByShift,
    },
  };
}
