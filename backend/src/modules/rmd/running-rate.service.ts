/**
 * RMD running rate (TPH) = production ÷ hours the mill was running, per RMD day (08:00 →
 * 08:00 IST) / week / month. Production is the ERP log sheet (PRODUCT_PRIME_SLENGTH_MT,
 * production.service.ts), summed by its date.
 *
 * Running hours, as for HSM: the mill is running while billets keep entering less than
 * RUN_GAP_MS apart (10 min); a longer gap is a stop. RMD has two lines, so the mill counts as
 * running while EITHER line feeds billets: the M1 and M2 counters are read as one timeline.
 */
import type { Env } from '../../config/env';
import type { Grain, RmdRatePeriod, RmdRunningRateReport } from '../../contracts';
import { RMD_BILLET_COUNT } from '../../integrations/historian/tags';
import { MSG } from '../../shared/messages';
import { dateRange, periodOf, readCounter, round2 } from '../hsm/production.service';
import { RUN_GAP_MS, runsOf } from '../hsm/running-rate.service';
import { RMD_DAY_START_HOUR, rmdDayStart } from './billets.service';
import { rmdProductionByDay } from './production.service';

const DAY_MS = 86_400_000;
const H_MS = 3_600_000;

/** Production ÷ hours; null without production or without running time. */
export const rmdRate = (mt: number | null, h: number | null) => (mt === null || !h ? null : round2(mt / h));

export async function rmdRunningRate(env: Env, from: string, to: string, grain: Grain, nowMs = Date.now()): Promise<RmdRunningRateReport> {
  const dates = dateRange(from, to);
  const fromMs = rmdDayStart(from);
  const toMs = Math.min(rmdDayStart(to) + DAY_MS, nowMs);
  const [m1, m2] = await Promise.all([
    readCounter(env, RMD_BILLET_COUNT.M1, fromMs, toMs),
    readCounter(env, RMD_BILLET_COUNT.M2, fromMs, toMs),
  ]);
  const runs = runsOf([...m1.increments, ...m2.increments], RUN_GAP_MS, RMD_DAY_START_HOUR);
  const hoursOn = (d: string) => runs.filter((r) => r.date === d).reduce((a, r) => a + (r.end - r.start), 0) / H_MS;
  const up = m1.connection === 'up' || m2.connection === 'up';
  const production = rmdProductionByDay(env, dates);
  const productionOf = (d: string): number | null => production.get(d) ?? null;

  const period = (key: string, label: string, ds: string[]): RmdRatePeriod => {
    const runH = up ? round2(ds.reduce((a, d) => a + hoursOn(d), 0)) : null;
    const prod = ds.map(productionOf);
    const productionMt = prod.every((p) => p === null) ? null : round2(prod.reduce<number>((a, p) => a + (p ?? 0), 0));
    return { key, label, fromDate: ds[0], toDate: ds[ds.length - 1], days: ds.length, runH, productionMt, rateTph: rmdRate(productionMt, runH) };
  };
  const groups = new Map<string, { label: string; dates: string[] }>();
  for (const d of dates) {
    const p = periodOf(d, grain);
    const g = groups.get(p.key) ?? { label: p.label, dates: [] };
    g.dates.push(d);
    groups.set(p.key, g);
  }
  const down = !up ? (m1.connection === 'down' ? m1 : m2) : null;
  return {
    from, to, grain, gapMinutes: RUN_GAP_MS / 60_000,
    influx: down ? { connection: 'down', message: down.message } : { connection: 'up', message: MSG.HISTORIAN_UP },
    rows: [...groups].map(([key, g]) => period(key, g.label, g.dates)),
    totals: period('total', 'Total', dates),
  };
}
