/**
 * LSM production plan: target MT per day and shift (the Production card's measure, PRODUTION_MT)
 * from the logbook Production Plan form (LSM ROLLING PLAN), saved on the dashboard (Edit plan) — the
 * only source (the user, 31 Oct 2026; the October 2026 Excel plan was moved into the form). A date
 * with no entry has no plan. Plan gap and compliance compare only the days with ERP production.
 *
 * Output per shift (the user, 16 Oct 2026): the ERP enters production per day only, so a date's
 * PRODUTION_MT is split between the shifts by their prime pieces in the logbook's LSM Production
 * Sheet (filled every hour, each entry with its Date and DAY / NIGHT shift):
 *   Day MT = PRODUTION_MT × Day prime pcs ÷ (Day + Night prime pcs), Night the same.
 * Day + Night is always the ERP figure. Pieces are used as entered; an entry with no shift is
 * in neither. Read fresh from the logbook, submissions from a month before the period.
 */
import type { Env } from '../../config/env';
import type { LsmPlanReport, RmdPlanDay } from '../../contracts';
import { fetchFormEntries, num, type InsightEntry } from '../../integrations/logbook/client';
import { MSG } from '../../shared/messages';
import { dateRange, round2 } from '../hsm/production.service';
import { RMD_SHIFTS, planDaysFrom, summarisePlan } from '../rmd/plan.service';
import { lsmProductionByDay } from './production.service';
import { planSource, savedPlanDays } from '../forms-db/plan.store';
import type { ConfigMill } from '../forms-db/forms';

export const LSM_SHEET_FORM = 'lsm-production-sheet/production-sheet';
const LOOK_BACK_MS = 31 * 86_400_000;

/** Prime pieces per date and shift ("Day" / "Night"), from the form's entries. */
export function primeByShift(entries: InsightEntry[]): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  for (const e of entries) {
    const res = e.result ?? {};
    if (/\btest\b/i.test(String(res['remarks'] ?? ''))) continue;   // a test entry is not production
    const shift = RMD_SHIFTS.find((s) => s.toUpperCase() === String(res['shift'] ?? '').trim().toUpperCase());
    const date = String(res['date'] ?? '').slice(0, 10);
    const pcs = num(res['prime']);
    if (!shift || !date || pcs === null) continue;
    const d = out.get(date) ?? {};
    d[shift] = (d[shift] ?? 0) + pcs;
    out.set(date, d);
  }
  return out;
}

/** A date's ERP production split by its shifts' prime pieces; null for both without either. */
export function splitByShift(day: RmdPlanDay, pcs: Record<string, number> | undefined): Record<string, number | null> {
  const total = RMD_SHIFTS.reduce((a, s) => a + (pcs?.[s] ?? 0), 0);
  return Object.fromEntries(RMD_SHIFTS.map((s) => [
    s, day.actualMt === null || !total ? null : round2(day.actualMt * ((pcs?.[s] ?? 0) / total)),
  ]));
}

/**
 * Per shift, over the days with a split: Σ output, Σ that shift's plan on those days, compliance.
 * Without a plan (RMS), only the output.
 */
export function shiftTotals(days: RmdPlanDay[]): NonNullable<LsmPlanReport['totals']['shifts']> {
  const anyPlan = days.some((d) => d.planMt !== null);
  return Object.fromEntries(RMD_SHIFTS.map((s) => {
    const both = days.filter((d) => (!anyPlan || d.planMt !== null) && d.actualByShift?.[s] != null);
    if (!both.length) return [s, { actualMt: null, comparedPlanMt: null, compliancePct: null }];
    const actualMt = round2(both.reduce((a, d) => a + d.actualByShift![s]!, 0));
    if (!anyPlan) return [s, { actualMt, comparedPlanMt: null, compliancePct: null }];
    const comparedPlanMt = round2(both.reduce((a, d) => a + (d.byShift[s] ?? 0), 0));
    return [s, { actualMt, comparedPlanMt, compliancePct: comparedPlanMt ? round2((actualMt / comparedPlanMt) * 100) : null }];
  }));
}

/**
 * A mill's plan per day and shift against its ERP production, with output per shift from its
 * Production Sheet form (LSM, RMS): the ERP day split by the shifts' prime pieces.
 */
export async function planWithShifts(env: Env, from: string, to: string, opts: {
  actual: (dates: string[]) => Map<string, number | null>; form: string; mill: ConfigMill;
}): Promise<LsmPlanReport> {
  const dates = dateRange(from, to);
  const [read, saved] = await Promise.all([
    fetchFormEntries(opts.form, Date.parse(`${from}T00:00:00+05:30`) - LOOK_BACK_MS, env),
    // The plan: the logbook Production Plan form.
    savedPlanDays(env, opts.mill, from, to).catch(() => new Map()),
  ]);
  const pcs = read.ok ? primeByShift(read.rows) : new Map<string, Record<string, number>>();
  const days = planDaysFrom(dates, opts.actual(dates), saved)
    .map((d) => ({ ...d, actualByShift: splitByShift(d, pcs.get(d.date)) }));
  return {
    from, to, source: planSource(saved), days,
    totals: { ...summarisePlan(days), shifts: shiftTotals(days) },
    shiftSource: { form: opts.form, connection: read.ok ? 'up' : 'down', message: read.ok ? MSG.LOGBOOK_UP : read.message },
  };
}

export function lsmPlan(env: Env, from: string, to: string): Promise<LsmPlanReport> {
  return planWithShifts(env, from, to, { actual: (dates) => lsmProductionByDay(env, dates), form: LSM_SHEET_FORM, mill: 'lsm' });
}
