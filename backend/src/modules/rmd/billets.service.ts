/**
 * RMD billets in, from the Influx counters — one per line (M1, M2), per RMD plant day, grouped
 * by day / week / month. RMD runs a 24-hour cycle of two shifts, 08:00–20:00 and 20:00–08:00
 * IST (plant, 9 Oct 2026), so its day is 08:00 → 08:00 IST — not HSM's 06:00. A day's
 * billets are the sum of the counter's increases in it (resets dropped, as for HSM). This is
 * the denominator of RMD's mass yield; the numerator (ERP finished production) is not wired.
 */
import type { Env } from '../../config/env';
import type { Grain, RmdBilletDay, RmdBilletPeriod, RmdBilletsReport } from '../../contracts';
import { RMD_BILLET_COUNT } from '../../integrations/historian/tags';
import { MSG } from '../../shared/messages';
import { dateRange, istDate, periodOf, readCounter, type Increment } from '../hsm/production.service';

const H_MS = 3_600_000;
const DAY_MS = 24 * H_MS;
const IST_MS = 330 * 60_000;

/** The RMD day starts with its first shift, 08:00 IST. */
export const RMD_DAY_START_HOUR = 8;
/** RMD date an instant falls in (before 08:00 IST it is still the previous date). */
const plantDateOf = (ms: number) => istDate(ms - RMD_DAY_START_HOUR * H_MS);
/** Epoch ms of 08:00 IST on RMD date `d`. */
export const rmdDayStart = (d: string) => Date.parse(`${d}T00:00:00Z`) - IST_MS + RMD_DAY_START_HOUR * H_MS;

/**
 * Billets per plant date from one counter's increases. A date the counter had not reached
 * (before its first reading, after its last, or still to come) is null — not 0.
 */
export function billetsPerDay(dates: string[], increments: Increment[], firstAt: number | null, lastAt: number | null, nowMs: number): Map<string, number | null> {
  const sums = new Map<string, number>();
  for (const p of increments) {
    const d = plantDateOf(p.t);
    sums.set(d, (sums.get(d) ?? 0) + p.v);
  }
  return new Map(dates.map((d) => {
    const start = rmdDayStart(d);
    const covered = firstAt !== null && lastAt !== null && firstAt < start + DAY_MS && lastAt >= start && start <= nowMs;
    return [d, covered ? Math.round(sums.get(d) ?? 0) : null];
  }));
}

const addNull = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));
const sumNull = (xs: (number | null)[]) => xs.reduce<number | null>((acc, v) => addNull(acc, v), null);

function summarise(key: string, label: string, days: RmdBilletDay[]): RmdBilletPeriod {
  const m1 = sumNull(days.map((d) => d.m1));
  const m2 = sumNull(days.map((d) => d.m2));
  return { key, label, fromDate: days[0].date, toDate: days[days.length - 1].date, days: days.length, m1, m2, totalPcs: addNull(m1, m2) };
}

export async function rmdBillets(env: Env, from: string, to: string, grain: Grain, nowMs = Date.now()): Promise<RmdBilletsReport> {
  const dates = dateRange(from, to);
  const fromMs = rmdDayStart(from);
  const toMs = Math.min(rmdDayStart(to) + DAY_MS, nowMs);
  const [m1, m2] = await Promise.all([
    readCounter(env, RMD_BILLET_COUNT.M1, fromMs, toMs),
    readCounter(env, RMD_BILLET_COUNT.M2, fromMs, toMs),
  ]);
  const per1 = billetsPerDay(dates, m1.increments, m1.firstReadingAt, m1.lastReadingAt, nowMs);
  const per2 = billetsPerDay(dates, m2.increments, m2.firstReadingAt, m2.lastReadingAt, nowMs);
  const days: RmdBilletDay[] = dates.map((date) => {
    const a = per1.get(date) ?? null;
    const b = per2.get(date) ?? null;
    return { date, m1: a, m2: b, totalPcs: addNull(a, b) };
  });

  const groups = new Map<string, { label: string; days: RmdBilletDay[] }>();
  for (const d of days) {
    const p = periodOf(d.date, grain);
    const g = groups.get(p.key) ?? { label: p.label, days: [] };
    g.days.push(d);
    groups.set(p.key, g);
  }
  const down = m1.connection === 'down' ? m1 : m2.connection === 'down' ? m2 : null;
  return {
    from, to, grain,
    influx: down ? { connection: 'down', message: down.message } : { connection: 'up', message: MSG.HISTORIAN_UP },
    days,
    rows: [...groups].map(([key, g]) => summarise(key, g.label, g.days)),
    totals: summarise('total', 'Total', days),
  };
}
