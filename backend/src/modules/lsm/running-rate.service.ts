/**
 * LSM and RMS running rate = ERP production ÷ running hours, the running hours calculated from
 * the mill's Production Sheet form in the logbook (the user, 16 Oct 2026: calculated here, the
 * ERP's NET_RUNNING_HRS only to compare against). The plant historian has no LSM or RMS signals.
 *
 * Each entry is one run, start-time → end-time. The form stamps those times with the day it was
 * filled, not the day of the run, so only their clock time is used: the run is placed on its
 * Date's mill day (LSM 09:00 → 09:00, RMS 09:30 → 09:30 IST), and a day's runs are merged so a
 * minute entered twice counts once. An entry without both times, or remarked "test", is left out.
 *
 * Checked against NET_RUNNING_HRS, 1–13 Oct 2026: RMS within an hour on 10 of 14 days (177 h vs
 * 170 h); LSM within an hour on the days filled through (7, 11, 12, 13 Oct), short where entries
 * are missing (2, 6, 15 Oct) — the figure is what the form holds.
 */
import type { Env } from '../../config/env';
import type { FormRunningRateReport, Grain, RmdRatePeriod } from '../../contracts';
import { fetchFormEntries, type InsightEntry } from '../../integrations/logbook/client';
import { MSG } from '../../shared/messages';
import { dateRange, periodOf, round2 } from '../hsm/production.service';

const DAY_MIN = 1440;
const LOOK_BACK_MS = 31 * 86_400_000;

/** "2026-10-16T23:00:00" → 1380 (minutes after midnight); null when unreadable. */
const clockOf = (v: unknown): number | null => {
  const m = /T(\d{2}):(\d{2})/.exec(String(v ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Running hours per Date: each run on its mill day (from `dayStartMin`), overlaps merged. */
export function runHoursByDay(entries: InsightEntry[], dayStartMin: number): Map<string, number> {
  const runs = new Map<string, [number, number][]>();
  for (const e of entries) {
    const res = e.result ?? {};
    if (/\btest\b/i.test(String(res['remarks'] ?? ''))) continue;
    const date = String(res['date'] ?? '').slice(0, 10);
    const a = clockOf(res['start-time']);
    const b = clockOf(res['end-time']);
    if (!date || a === null || b === null) continue;
    const from = (a - dayStartMin + DAY_MIN) % DAY_MIN;
    const list = runs.get(date) ?? [];
    list.push([from, from + ((b - a + DAY_MIN) % DAY_MIN)]);
    runs.set(date, list);
  }
  const out = new Map<string, number>();
  for (const [date, list] of runs) {
    list.sort((x, y) => x[0] - y[0]);
    let minutes = 0;
    let cur: [number, number] | null = null;
    for (const [s, t] of list) {
      if (cur && s <= cur[1]) cur[1] = Math.max(cur[1], t);
      else { if (cur) minutes += cur[1] - cur[0]; cur = [s, t]; }
    }
    if (cur) minutes += cur[1] - cur[0];
    out.set(date, round2(minutes / 60));
  }
  return out;
}

/** One period: Σ production, Σ hours, and the rate over the days that have both. */
export function ratePeriod(key: string, label: string, dates: string[], production: Map<string, number | null>, hours: Map<string, number>): RmdRatePeriod {
  const prod = dates.map((d) => production.get(d) ?? null).filter((v): v is number => v !== null);
  const hrs = dates.map((d) => hours.get(d)).filter((v): v is number => v !== undefined);
  const both = dates.filter((d) => production.get(d) != null && (hours.get(d) ?? 0) > 0);
  const bothMt = both.reduce((a, d) => a + production.get(d)!, 0);
  const bothH = both.reduce((a, d) => a + hours.get(d)!, 0);
  return {
    key, label, fromDate: dates[0], toDate: dates[dates.length - 1], days: dates.length,
    runH: hrs.length ? round2(hrs.reduce((a, b) => a + b, 0)) : null,
    productionMt: prod.length ? round2(prod.reduce((a, b) => a + b, 0)) : null,
    rateTph: bothH ? round2(bothMt / bothH) : null,
  };
}

export async function formRunningRate(env: Env, from: string, to: string, grain: Grain, opts: {
  form: string; dayStartMin: number; production: (dates: string[]) => Map<string, number | null>;
}): Promise<FormRunningRateReport> {
  const dates = dateRange(from, to);
  const read = await fetchFormEntries(opts.form, Date.parse(`${from}T00:00:00+05:30`) - LOOK_BACK_MS, env);
  const hours = read.ok ? runHoursByDay(read.rows, opts.dayStartMin) : new Map<string, number>();
  const production = opts.production(dates);
  const groups = new Map<string, { label: string; dates: string[] }>();
  for (const d of dates) {
    const p = periodOf(d, grain);
    const g = groups.get(p.key) ?? { label: p.label, dates: [] };
    g.dates.push(d);
    groups.set(p.key, g);
  }
  return {
    from, to, grain, form: opts.form,
    logbook: { connection: read.ok ? 'up' : 'down', message: read.ok ? MSG.LOGBOOK_UP : read.message },
    rows: [...groups].map(([key, g]) => ratePeriod(key, g.label, g.dates, production, hours)),
    totals: ratePeriod('total', 'Total', dates, production, hours),
  };
}
