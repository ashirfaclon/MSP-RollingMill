/**
 * Production plan in its logbook form (Production Plan Form Spec): one entry per date with every
 * column of the dashboard's Edit plan popup. Saving a month writes all its dates; for each date the
 * latest entry wins. The ONLY source of every mill's plan (the user, 31 Oct 2026): the plans once
 * imported from the plant's Excel files were moved into these forms; a date with no entry has no plan.
 *
 * RMD: each plan is for Online or Offline — the form's Rolling field, one entry per date and rolling
 * (the user, 13 Nov 2026). Both = Online + Offline. Entries saved before carry no Rolling: they are
 * the whole mill's, shown under Both only, for dates with no Online / Offline entry.
 */
import type { Env } from '../../config/env';
import type { PlanRolling, PlanSaveBody, RmdMode, SavedPlan } from '../../contracts';
import { saveFormEntries, fetchFormEntries, num, type FormWrite, type InsightEntry } from '../../integrations/logbook/client';
import { HttpError } from '../../shared/http-error';
import { dateRange, isDate, round2 } from '../hsm/production.service';
import { PLAN_FORM, PLAN_KEYS as K, ROLLING_LABELS, tagOf, type ConfigMill } from './forms';

const DAY_MS = 86_400_000;
/** Plans are saved ahead of their month: read a year of submissions. */
const LOOK_BACK_MS = 400 * DAY_MS;

export interface SavedPlanDay { date: string; dayOff: boolean; nightOff: boolean; dayMt: number; nightMt: number; monthPlanMt: number | null; at: string }

/**
 * The form's Shutdown dropdown (Production Plan Form Spec): No, Day shift, Night shift, or Yes = the
 * whole day. A shutdown can be a single shift (the user, 31 Oct 2026); entries saved before keep Yes / No.
 */
export const shutdownValue = (dayOff: boolean, nightOff: boolean) =>
  dayOff && nightOff ? 'Yes' : dayOff ? 'Day shift' : nightOff ? 'Night shift' : 'No';
export function shutdownOf(v: unknown): { dayOff: boolean; nightOff: boolean } {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'yes' || s === 'whole day') return { dayOff: true, nightOff: true };
  return { dayOff: s === 'day shift', nightOff: s === 'night shift' };
}

/** The form's Rolling value → online / offline; null for an entry without one (saved before the split). */
export function rollingOf(v: unknown): PlanRolling | null {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'online' || s === 'offline' ? s : null;
}

const mmYyyy = (month: string) => `${month.slice(5, 7)}-${month.slice(0, 4)}`;
const monthDates = (month: string) => {
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  return dateRange(`${month}-01`, `${month}-${String(last).padStart(2, '0')}`);
};

/** The entries the dashboard writes for one month, every column filled. Throws on a bad body. */
export function planEntries(body: PlanSaveBody): Record<string, unknown>[] {
  if (!/^\d{4}-\d{2}$/.test(String(body?.month))) throw new HttpError(400, 'bad_month', 'month must be YYYY-MM');
  const dates = monthDates(body.month);
  const days = Array.isArray(body.days) ? body.days : [];
  const byDate = new Map(days.map((d) => [d.date, d]));
  if (days.length !== dates.length || !dates.every((d) => byDate.has(d))) {
    throw new HttpError(400, 'bad_days', 'days must be every date of the month, once');
  }
  const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  if (!ok(body.monthPlanMt)) throw new HttpError(400, 'bad_plan', 'monthPlanMt must be a number ≥ 0');
  const rows = dates.map((date) => {
    const d = byDate.get(date)!;
    if (!isDate(date) || !ok(d.dayMt) || !ok(d.nightMt)) throw new HttpError(400, 'bad_day', `${date}: Day and Night must be numbers ≥ 0`);
    const dayOff = d.dayOff === true;
    const nightOff = d.nightOff === true;
    return { date, dayOff, nightOff, day: dayOff ? 0 : round2(d.dayMt), night: nightOff ? 0 : round2(d.nightMt) };
  });
  const monthDay = round2(rows.reduce((a, r) => a + r.day, 0));
  const monthNight = round2(rows.reduce((a, r) => a + r.night, 0));
  // Working days: a whole-day shutdown takes a day off, a single shift half a day.
  const workingDays = rows.reduce((a, r) => a + (r.dayOff ? 0 : 0.5) + (r.nightOff ? 0 : 0.5), 0);
  return rows.map((r) => ({
    ...(body.rolling ? { [K.rolling]: ROLLING_LABELS[body.rolling] } : {}),
    [K.month]: mmYyyy(body.month),
    [K.monthPlan]: round2(body.monthPlanMt),
    [K.workingDays]: workingDays,
    [K.date]: r.date,
    [K.shutdown]: shutdownValue(r.dayOff, r.nightOff),
    [K.day]: r.day,
    [K.night]: r.night,
    [K.dayTotal]: round2(r.day + r.night),
    [K.monthDay]: monthDay,
    [K.monthNight]: monthNight,
    [K.monthTotal]: round2(monthDay + monthNight),
  }));
}

export function savePlan(env: Env, mill: ConfigMill, body: PlanSaveBody, filledBy: string): Promise<FormWrite> {
  const rolling = body?.rolling;
  if (mill === 'rmd' ? rolling !== 'online' && rolling !== 'offline' : rolling !== undefined) {
    throw new HttpError(400, 'bad_rolling', mill === 'rmd' ? 'rolling must be online or offline' : 'rolling is for RMD only');
  }
  // One row per date (RMD: per date and rolling): saved before → updated, not added again.
  const keyOf = (r: Record<string, unknown>) => `${String(r[K.date] ?? '')}${mill === 'rmd' ? `|${rollingOf(r[K.rolling]) ?? ''}` : ''}`;
  return saveFormEntries(PLAN_FORM[mill], planEntries(body), keyOf, filledBy, env);
}

/**
 * The latest saved entry of each date (dates from `from` to `to`); empty when none or the logbook is down.
 * `rolling` (RMD): that rolling's entries only; 'all' = Online + Offline per date, or the whole-mill
 * entry of a date that has neither.
 */
export async function savedPlanDays(env: Env, mill: ConfigMill, from: string, to: string, rolling: RmdMode = 'all'): Promise<Map<string, SavedPlanDay>> {
  const read = await fetchFormEntries(tagOf(PLAN_FORM[mill]), Date.parse(`${from}T00:00:00+05:30`) - LOOK_BACK_MS, env);
  // date → rolling ('' = none) → its latest entry.
  const latest = new Map<string, Map<string, SavedPlanDay>>();
  if (!read.ok) return new Map();
  const at = (r: InsightEntry) => String(r.createdAt ?? r.invocationTime ?? '');
  for (const r of [...read.rows].sort((a, b) => at(a).localeCompare(at(b)))) {
    const v = r.result ?? {};
    const date = String(v[K.date] ?? '').slice(0, 10);
    if (!isDate(date) || date < from || date > to) continue;
    const day = num(v[K.day]);
    const night = num(v[K.night]);
    if (day === null || night === null) continue;
    const m = latest.get(date) ?? new Map<string, SavedPlanDay>();
    m.set(rollingOf(v[K.rolling]) ?? '', { date, ...shutdownOf(v[K.shutdown]), dayMt: day, nightMt: night, monthPlanMt: num(v[K.monthPlan]), at: at(r) });
    latest.set(date, m);
  }
  const out = new Map<string, SavedPlanDay>();
  for (const [date, m] of latest) {
    const d = planOfDate(m, rolling);
    if (d) out.set(date, d);
  }
  return out;
}

/**
 * One date's plan from its latest entry per rolling ('' = an entry without one): that rolling's, or for
 * 'all' Online + Offline (a shift is off only when it is off in both), else the whole-mill entry.
 */
export function planOfDate(m: Map<string, SavedPlanDay>, rolling: RmdMode): SavedPlanDay | undefined {
  if (rolling !== 'all') return m.get(rolling);
  const on = m.get('online');
  const off = m.get('offline');
  if (!on || !off) return on ?? off ?? m.get('');
  return {
    date: on.date, dayOff: on.dayOff && off.dayOff, nightOff: on.nightOff && off.nightOff,
    dayMt: round2(on.dayMt + off.dayMt), nightMt: round2(on.nightMt + off.nightMt),
    monthPlanMt: on.monthPlanMt !== null && off.monthPlanMt !== null ? round2(on.monthPlanMt + off.monthPlanMt) : null,
    at: on.at > off.at ? on.at : off.at,
  };
}

/** The month as last saved, for the popup to open on. */
export async function savedPlan(env: Env, mill: ConfigMill, month: string, rolling: PlanRolling | null = null): Promise<SavedPlan> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, 'bad_month', 'month must be YYYY-MM');
  const dates = monthDates(month);
  const saved = await savedPlanDays(env, mill, dates[0], dates[dates.length - 1], rolling ?? 'all');
  const days = dates.flatMap((d) => (saved.has(d) ? [saved.get(d)!] : []));
  return {
    month,
    rolling,
    saved: days.length > 0,
    monthPlanMt: days.length ? days[days.length - 1].monthPlanMt : null,
    days: days.map(({ date, dayOff, nightOff, dayMt, nightMt }) => ({ date, dayOff, nightOff, dayMt, nightMt })),
    savedAt: days.length ? days.map((d) => d.at).sort().at(-1)! : null,
  };
}

/** A plan's days from the saved dates: their target is Day + Night, per shift as saved; any other date has none. */
export function withSavedPlan<T extends { date: string; planMt: number | null; byShift: Record<string, number> }>(
  days: T[], saved: Map<string, SavedPlanDay>,
): T[] {
  return days.map((d) => {
    const s = saved.get(d.date);
    return s ? { ...d, planMt: round2(s.dayMt + s.nightMt), byShift: { Day: s.dayMt, Night: s.nightMt } } : d;
  });
}

/** The plan's source line. */
export const planSource = (saved: Map<string, SavedPlanDay>) =>
  saved.size ? 'Logbook Production Plan (saved on the dashboard)' : 'Logbook Production Plan: no plan saved for this period';

/** Days with no plan yet, for withSavedPlan to fill from the logbook. */
export const unplannedDays = (dates: string[]) => dates.map((date) => ({ date, planMt: null as number | null, byShift: {} as Record<string, number> }));
