/**
 * HSM Visualization's Hot billet (heater) and Mill power (the user, 25 Nov 2026) from the logbook's
 * "Electrical HSM → Billet Heater Performance & Mill Power" (electrical-hsm/billet-heater-performance-mill-power):
 * one entry a day, by the form's Date —
 *   hot billet   `hot-billet-mt`, `hot-billet-kwh`, `hot-billet-kwh-mt`   (running with the billet heater)
 *   cold billet  `cold-billet-mt`, `cold-billet-kwh`, `cold-billet-kwh-mt`
 *   mill power   `mill-power-mt`, `mill-power-kwh`, `mill-power-kwh-mt`
 * Over a period: MT and kWh are summed; kWh per MT is Σ kWh ÷ Σ MT over the days that have both (a big day
 * counts more than a small one), which for one day is the form's own figure; without them, the mean of the
 * form's kWh per MT. An entry remarked "test" is left out. Read fresh from the logbook.
 */
import type { Env } from '../../config/env';
import type { Grain, HsmHeaterPowerPeriod, HsmHeaterPowerReport } from '../../contracts';
import { fetchFormEntries, num, type InsightEntry } from '../../integrations/logbook/client';
import { MSG } from '../../shared/messages';
import { dateRange, periodOf, round2 } from './production.service';

export const HEATER_POWER_FORM = 'electrical-hsm/billet-heater-performance-mill-power';
const LAST_ENTRY_LOOK_BACK_MS = 183 * 86_400_000;
const BLOCKS = ['hot-billet', 'cold-billet', 'mill-power'] as const;
type Block = (typeof BLOCKS)[number];

export interface HeaterPowerDay { date: string; v: Record<Block, { mt: number | null; kwh: number | null; kwhPerMt: number | null }> }

export function toHeaterPowerDay(r: InsightEntry): HeaterPowerDay | null {
  const res = r.result ?? {};
  if (/\btest\b/i.test(String(res['remarks'] ?? ''))) return null;
  const date = String(res['date'] ?? '').slice(0, 10);
  if (!date) return null;
  const v = Object.fromEntries(BLOCKS.map((b) => [b, { mt: num(res[`${b}-mt`]), kwh: num(res[`${b}-kwh`]), kwhPerMt: num(res[`${b}-kwh-mt`]) }])) as HeaterPowerDay['v'];
  return { date, v };
}

const sum = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null); return v.length ? round2(v.reduce((a, b) => a + b, 0)) : null; };

/** Σ kWh ÷ Σ MT over the days with both; else the mean of the form's kWh per MT; null with neither. */
export function perMt(days: HeaterPowerDay[], b: Block): number | null {
  const both = days.map((d) => d.v[b]).filter((x) => x.kwh !== null && x.mt !== null && x.mt > 0);
  if (both.length) return round2(both.reduce((a, x) => a + x.kwh!, 0) / both.reduce((a, x) => a + x.mt!, 0));
  const given = days.map((d) => d.v[b].kwhPerMt).filter((x): x is number => x !== null);
  return given.length ? round2(given.reduce((a, x) => a + x, 0) / given.length) : null;
}

export function summarise(key: string, label: string, dates: string[], all: HeaterPowerDay[]): HsmHeaterPowerPeriod {
  const days = all.filter((d) => d.date >= dates[0] && d.date <= dates[dates.length - 1]);
  const of = (b: Block, k: 'mt' | 'kwh') => sum(days.map((d) => d.v[b][k]));
  return {
    key, label, fromDate: dates[0], toDate: dates[dates.length - 1], days: dates.length,
    entryDays: new Set(days.map((d) => d.date)).size,
    hotBilletMt: of('hot-billet', 'mt'), hotBilletKwh: of('hot-billet', 'kwh'), hotBilletKwhPerMt: perMt(days, 'hot-billet'),
    coldBilletMt: of('cold-billet', 'mt'), coldBilletKwh: of('cold-billet', 'kwh'), coldBilletKwhPerMt: perMt(days, 'cold-billet'),
    millPowerMt: of('mill-power', 'mt'), millPowerKwh: of('mill-power', 'kwh'), millPowerKwhPerMt: perMt(days, 'mill-power'),
  };
}

const lastDateOf = (days: HeaterPowerDay[], to: string) =>
  days.filter((d) => d.date <= to).reduce<string | null>((a, d) => (a === null || d.date > a ? d.date : a), null);

export async function hsmHeaterPower(env: Env, from: string, to: string, grain: Grain): Promise<HsmHeaterPowerReport> {
  const startMs = Date.parse(`${from}T00:00:00+05:30`);
  const parse = (rows: InsightEntry[]) => rows.map(toHeaterPowerDay).filter((d): d is HeaterPowerDay => d !== null);
  // Submissions from a month before the period: a day's entry is often filed the day after.
  const read = await fetchFormEntries(HEATER_POWER_FORM, startMs - 31 * 86_400_000, env);
  const all = read.ok ? parse(read.rows) : [];
  let lastDate = lastDateOf(all, to);
  if (lastDate === null && read.ok) {
    const older = await fetchFormEntries(HEATER_POWER_FORM, startMs - LAST_ENTRY_LOOK_BACK_MS, env).catch(() => null);
    if (older?.ok) lastDate = lastDateOf(parse(older.rows), to);
  }
  const dates = dateRange(from, to);
  const groups = new Map<string, { label: string; dates: string[] }>();
  for (const d of dates) {
    const p = periodOf(d, grain);
    const g = groups.get(p.key) ?? { label: p.label, dates: [] };
    g.dates.push(d);
    groups.set(p.key, g);
  }
  return {
    from, to, grain, form: HEATER_POWER_FORM,
    logbook: { connection: read.ok ? 'up' : 'down', message: read.ok ? MSG.LOGBOOK_UP : read.message },
    rows: [...groups].map(([key, g]) => summarise(key, g.label, g.dates, all)),
    totals: summarise('total', 'Total', dates, all),
    lastDate,
  };
}
