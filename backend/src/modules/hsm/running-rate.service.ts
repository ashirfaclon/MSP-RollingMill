/**
 * Running rate (TPH) = production ÷ hours the mill was running, per plant day / week / month.
 *
 * Calculated here, not read from anywhere:
 *   – production: the Production card's Influx figure (Total_Production_Ton reset events,
 *     noise removed — production.ts);
 *   – running hours: from the Dicharged_Billet counter. The mill is running while billets
 *     keep leaving the furnace less than RUN_GAP_MS apart; a longer gap is a stop. Each
 *     gap of at most RUN_GAP_MS counts as running time, split at 06:00 into plant days.
 *
 * Checked 6 Oct 2026 against the hours operators enter in the ERP log sheet
 * (NET_RUNNING_HRS): 23 Sep 7.7 vs 7.70, 24 Sep 8.5 vs 8.36, 25 Sep 5.3 vs 5.55. The ERP
 * rate (PRODUCTION_MT ÷ NET_RUNNING_HRS, = its PROD_RATE_ON_RUNNING_HRS) is returned beside
 * ours for comparison only.
 */
import type { Env } from '../../config/env';
import { readErpProduction } from '../../integrations/erp/cache';
import { HSM_DISCHARGED_BILLET } from '../../integrations/historian/tags';
import {
  DAY_MS, dateRange, istDate, periodOf, plantDayStart, productionComparison, readCounter, round2,
  PLANT_DAY_START_HOUR, type Grain, type Increment,
} from './production.service';
import type { RateDay, RatePeriod, RunningRateReport } from '../../contracts';
export type { RateDay, RatePeriod, RunningRateReport };

const H_MS = 3_600_000;

/** Longest gap between two billets that still counts as running. */
export const RUN_GAP_MS = 10 * 60_000;

/** One continuous run: billets discharged with no gap over RUN_GAP_MS, inside one plant day. */
export interface Run { date: string; start: number; end: number; billets: number }

/**
 * Runs from billet-counter increases. Pure. A run is cut at each 06:00 so every piece
 * belongs to one plant day; a lone billet with no neighbour within the gap adds no time.
 */
export function runsOf(ticks: Increment[], gapMs = RUN_GAP_MS): Run[] {
  const ts = [...ticks].sort((a, b) => a.t - b.t);
  const runs: Run[] = [];
  let cur: Run | null = null;
  const dayOf = (t: number) => istDate(t - PLANT_DAY_START_HOUR * H_MS);
  for (let i = 0; i < ts.length; i++) {
    const p = ts[i];
    const prev = ts[i - 1];
    if (cur && prev && p.t - prev.t <= gapMs) {
      // Same run; cut at a 06:00 that falls inside the gap.
      const boundary = plantDayStart(dayOf(p.t));
      if (prev.t < boundary) {
        cur.end = boundary;
        runs.push(cur);
        cur = { date: dayOf(p.t), start: boundary, end: p.t, billets: p.v };
      } else {
        cur.end = p.t;
        cur.billets += p.v;
      }
      continue;
    }
    if (cur) runs.push(cur);
    cur = { date: dayOf(p.t), start: p.t, end: p.t, billets: p.v };
  }
  if (cur) runs.push(cur);
  return runs;
}

const rate = (mt: number | null, h: number | null) => (mt === null || !h ? null : round2(mt / h));

/** Sums over days; each rate is Σ MT ÷ Σ hours over the days that have both. */
export function summariseRate(key: string, label: string, days: RateDay[]): RatePeriod {
  const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
  const inf = days.filter((d) => d.runH !== null && d.influxMt !== null);
  const erp = days.filter((d) => d.erpMt !== null && d.erpRunH !== null);
  const runH = inf.length ? sum(inf.map((d) => d.runH!)) : null;
  const influxMt = inf.length ? sum(inf.map((d) => d.influxMt!)) : null;
  const erpRunH = erp.length ? sum(erp.map((d) => d.erpRunH!)) : null;
  const erpMt = erp.length ? sum(erp.map((d) => d.erpMt!)) : null;
  const delays = days.filter((d) => d.erpDelayH !== null);
  return {
    key, label, fromDate: days[0].date, toDate: days[days.length - 1].date, days: days.length,
    elapsedH: sum(days.map((d) => d.elapsedH)),
    runH, runs: days.reduce((a, d) => a + d.runs, 0), influxMt, rateTph: rate(influxMt, runH),
    erpMt, erpRunH, erpDelayH: delays.length ? sum(delays.map((d) => d.erpDelayH!)) : null, erpRateTph: rate(erpMt, erpRunH),
  };
}

const memo = new Map<string, { at: number; value: Promise<RunningRateReport> }>();
const MEMO_MS = 60_000;

export function runningRate(env: Env, from: string, to: string, grain: Grain, nowMs = Date.now()): Promise<RunningRateReport> {
  const key = `${from}|${to}|${grain}`;
  const hit = memo.get(key);
  if (hit && nowMs - hit.at < MEMO_MS) return hit.value;
  const value = compute(env, from, to, grain, nowMs);
  memo.set(key, { at: nowMs, value });
  value.catch(() => memo.delete(key));
  if (memo.size > 32) memo.delete(memo.keys().next().value!);
  return value;
}

async function compute(env: Env, from: string, to: string, grain: Grain, nowMs: number): Promise<RunningRateReport> {
  const dates = dateRange(from, to);
  const fromMs = plantDayStart(from);
  const toMs = Math.min(plantDayStart(to) + DAY_MS, nowMs);
  // Read a gap early so a run already going at the first 06:00 is counted from 06:00.
  const [prod, billets] = await Promise.all([
    productionComparison(env, from, to, 'day', nowMs),
    readCounter(env, HSM_DISCHARGED_BILLET, fromMs - RUN_GAP_MS, toMs),
  ]);
  const runs = billets.connection === 'up' ? runsOf(billets.increments).filter((r) => r.date >= from && r.date <= to) : [];

  const runH = new Map<string, { h: number; n: number }>();
  for (const r of runs) {
    const x = runH.get(r.date) ?? { h: 0, n: 0 };
    x.h += (r.end - r.start) / H_MS;
    if (r.end > r.start) x.n += 1;
    runH.set(r.date, x);
  }
  const erpRows = readErpProduction(env)?.rows ?? [];
  const erp = new Map<string, { mt: number; h: number; delay: number; hasH: boolean }>();
  for (const r of erpRows) {
    if (r.date < from || r.date > to) continue;
    const e = erp.get(r.date) ?? { mt: 0, h: 0, delay: 0, hasH: false };
    e.mt += r.mt ?? 0;
    const h = r.v?.NET_RUNNING_HRS;
    if (h !== null && h !== undefined) { e.h += h; e.hasH = true; }
    e.delay += r.v?.DELAY_HRS ?? 0;
    erp.set(r.date, e);
  }
  const prodDay = new Map(prod.days.map((d) => [d.date, d]));

  const days: RateDay[] = dates.map((date) => {
    const start = plantDayStart(date);
    const elapsedH = round2(Math.max(0, Math.min(start + DAY_MS, nowMs) - start) / H_MS);
    const p = prodDay.get(date);
    const covered = billets.connection === 'up' && p?.influxCoverage !== 'none' && p?.influxMt !== null && p?.influxMt !== undefined;
    const r = runH.get(date);
    const h = covered ? round2(r?.h ?? 0) : null;
    const mt = covered ? p!.influxMt : null;
    const e = erp.get(date);
    return {
      date, elapsedH,
      runH: h, runs: r?.n ?? 0, influxMt: mt, rateTph: rate(mt, h),
      erpMt: e ? round2(e.mt) : null,
      erpRunH: e?.hasH ? round2(e.h) : null,
      erpDelayH: e ? round2(e.delay) : null,
      erpRateTph: e?.hasH ? rate(e.mt, e.h) : null,
    };
  });

  const groups = new Map<string, { label: string; days: RateDay[] }>();
  for (const d of days) {
    const p = periodOf(d.date, grain);
    const g = groups.get(p.key) ?? { label: p.label, days: [] };
    g.days.push(d);
    groups.set(p.key, g);
  }
  const iso = (ms: number) => new Date(ms).toISOString();
  return {
    from, to, grain,
    gapMinutes: RUN_GAP_MS / 60_000,
    influx: billets.connection === 'up' && prod.influx.connection === 'up'
      ? { connection: 'up', message: prod.influx.message }
      : { connection: 'down', message: billets.connection === 'down' ? billets.message : prod.influx.message },
    erp: { syncedAt: prod.erp.syncedAt, lastDate: prod.erp.lastDate },
    days,
    rows: [...groups].map(([k, g]) => summariseRate(k, g.label, g.days)),
    totals: summariseRate('total', 'Total', days),
    runs: runs.filter((r) => r.end > r.start).map((r) => ({
      date: r.date, start: iso(r.start), end: iso(r.end), hours: round2((r.end - r.start) / H_MS), billets: r.billets,
    })),
  };
}
