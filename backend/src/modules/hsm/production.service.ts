/**
 * HSM production — ERP daily figure beside the Influx counter, and the variance between.
 *
 *   ERP     Production Log Sheet, summed per date (erp/cache.ts). The confirmed figure,
 *           entered 1.5+ days late.
 *   Influx  Total_Production_Ton, a running total the operator resets now and then: a plant
 *           day's (06:00 → 06:00 IST) production is the total of its RESET EVENTS, each
 *           = counter before the reset − counter at the event's start (counterEvents.ts).
 *           The counter is coils × the set billet weight (no losses deducted), the ERP
 *           figure is weighed finished strip, so the variance is mostly mill loss.
 *   Variance  Influx − ERP, over days where BOTH have a full day of data only — an ERP
 *           day not yet entered, or a day the counter did not fully cover, must not show up
 *           as a gap between the two.
 *
 * All arithmetic lives here; the screen only draws what this returns.
 */
import type { Env } from '../../config/env';
import { MSG } from '../../shared/messages';
import { collect, esc, fluxTime, queryApi } from '../../integrations/influx';
import { historianConfigured } from '../../integrations/historian/client';
import { HSM_DISCHARGED_BILLET, HSM_TOTAL_PRODUCTION, type TagDef } from '../../integrations/historian/tags';
import { readErpCommercial, readErpProduction, type ErpProductionRow } from '../../integrations/erp/cache';
import {
  NOISE_WINDOW_MS, counterEvents, denoise, eventIncrements, readCounterEvents, removeNoise, type CounterEvent,
} from './counter-events';
import type { ByProductKey, ByProducts, DayValue, Grain, PeriodRow, ProductionComparison } from '../../contracts';
export type { ByProductKey, ByProducts, DayValue, Grain, PeriodRow, ProductionComparison };

/** The plant day, as used for the Influx side of the comparison. */
export const PLANT_DAY_START_HOUR = 6;
const IST_MS = 330 * 60_000;
export const DAY_MS = 86_400_000;
const H_MS = 3_600_000;

/* ------------------------------ dates (IST) ------------------------------ */

export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`));
/** YYYY-MM-DD of an instant, in plant time. */
export const istDate = (ms: number) => new Date(ms + IST_MS).toISOString().slice(0, 10);
export const dayIndex = (d: string) => Date.parse(`${d}T00:00:00Z`) / DAY_MS;
export const fromIndex = (i: number) => new Date(i * DAY_MS).toISOString().slice(0, 10);
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let i = dayIndex(from); i <= dayIndex(to); i += 1) out.push(fromIndex(i));
  return out;
}
/** Start of plant day D (06:00 IST on D), epoch ms. */
export const plantDayStart = (d: string) => Date.parse(`${d}T00:00:00Z`) - IST_MS + PLANT_DAY_START_HOUR * H_MS;

/* ------------------------------- per day -------------------------------- */

/**
 * The four by-products of rolling, as booked into ERP stores (PROD_TRAN receipts, division
 * S1). Each equals a log-sheet loss on every day checked (304 days, Nov 2025 – Oct 2026).
 * Mill scale and strip end cut take weight off every coil; miss-roll strip and strip finish
 * end cut (the rejects) are whole pieces lost.
 */
export const BY_PRODUCT_ITEMS = {
  millScale: { code: 'C01010100093', name: 'Mill Scale', logField: 'BLOSS_MT' },
  stripEndcut: { code: 'C01010100033', name: 'Strip Endcut', logField: 'ENDCUT_MT' },
  missRoll: { code: 'C01010100016', name: 'Miss Roll Strip', logField: 'MISSROLL_MT' },
  finishEndcut: { code: 'C01010100032', name: 'Strip Finish Endcut', logField: 'REJECT_MT' },
} as const satisfies Record<ByProductKey, { code: string; name: string; logField: string }>;
const BY_PRODUCT_KEYS = Object.keys(BY_PRODUCT_ITEMS) as ByProductKey[];
export const byProductTotal = (b: ByProducts) => BY_PRODUCT_KEYS.reduce((a, k) => a + b[k], 0);

/** The four by-products booked per plant date (from..to) in ERP stores, and the latest date with any booked. */
export function readByProducts(env: Env, from: string, to: string): { perDay: Map<string, ByProducts>; lastDate: string | null } {
  const com = readErpCommercial(env);
  const byCode = new Map(BY_PRODUCT_KEYS.map((k) => [BY_PRODUCT_ITEMS[k].code as string, k]));
  const perDay = new Map<string, ByProducts>();
  let lastDate: string | null = null;
  for (const l of com?.prodLines ?? []) {
    const k = byCode.get(l.item);
    if (!k) continue;
    if (lastDate === null || l.date > lastDate) lastDate = l.date;
    if (l.date < from || l.date > to) continue;
    const b = perDay.get(l.date) ?? { millScale: 0, stripEndcut: 0, missRoll: 0, finishEndcut: 0 };
    b[k] += l.mt;
    perDay.set(l.date, b);
  }
  return { perDay, lastDate };
}

export interface Increment { t: number; v: number }

/**
 * Assemble per-day values. Pure: ERP rows and counter increments in, days out.
 * `firstReadingAt` / `lastReadingAt` bound when the counter was publishing at all.
 */
export function buildDays(
  dates: string[],
  erpRows: { date: string; mt: number | null }[],
  increments: Increment[],
  firstReadingAt: number | null,
  lastReadingAt: number | null,
  nowMs: number,
): DayValue[] {
  const erp = new Map<string, { mt: number; n: number; anyNumber: boolean }>();
  for (const r of erpRows) {
    const e = erp.get(r.date) ?? { mt: 0, n: 0, anyNumber: false };
    e.n += 1;
    if (r.mt !== null && Number.isFinite(r.mt)) { e.mt += r.mt; e.anyNumber = true; }
    erp.set(r.date, e);
  }
  const inc = new Map<string, number>();
  for (const p of increments) {
    const d = istDate(p.t - PLANT_DAY_START_HOUR * H_MS);   // plant day the increase fell in
    inc.set(d, (inc.get(d) ?? 0) + p.v);
  }
  return dates.map((date) => {
    const e = erp.get(date);
    const start = plantDayStart(date);
    const end = start + DAY_MS;
    let coverage: DayValue['influxCoverage'] = 'none';
    if (firstReadingAt !== null && lastReadingAt !== null && firstReadingAt < end && lastReadingAt >= start) {
      coverage = firstReadingAt <= start && end <= nowMs && lastReadingAt >= end - 15 * 60_000 ? 'full' : 'partial';
    }
    return {
      date,
      erpMt: e?.anyNumber ? round2(e.mt) : null,
      erpEntries: e?.n ?? 0,
      influxMt: coverage === 'none' ? null : round2(inc.get(date) ?? 0),
      influxCoverage: coverage,
    };
  });
}

/* ------------------------------ aggregation ------------------------------ */

export const round2 = (x: number) => Math.round(x * 100) / 100;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dm = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

export function periodOf(date: string, grain: Grain): { key: string; label: string } {
  if (grain === 'day') return { key: date, label: dm(date) };
  if (grain === 'month') return { key: date.slice(0, 7), label: `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}` };
  // ISO-style week starting Monday.
  const i = dayIndex(date);
  const dow = (new Date(i * DAY_MS).getUTCDay() + 6) % 7;
  const monday = fromIndex(i - dow);
  return { key: `W${monday}`, label: `Week of ${dm(monday)}` };
}

export function aggregate(days: DayValue[], grain: Grain): PeriodRow[] {
  const groups = new Map<string, { label: string; days: DayValue[] }>();
  for (const d of days) {
    const p = periodOf(d.date, grain);
    const g = groups.get(p.key) ?? { label: p.label, days: [] };
    g.days.push(d);
    groups.set(p.key, g);
  }
  return [...groups].map(([key, g]) => summarise(key, g.label, g.days));
}

export function summarise(key: string, label: string, days: DayValue[]): PeriodRow {
  const erpDays = days.filter((d) => d.erpMt !== null);
  const infDays = days.filter((d) => d.influxMt !== null);
  const compared = days.filter((d) => d.erpMt !== null && d.influxCoverage === 'full');
  const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
  const cmpErp = sum(compared.map((d) => d.erpMt!));
  const variance = compared.length ? sum(compared.map((d) => d.influxMt! - d.erpMt!)) : null;
  return {
    key, label,
    fromDate: days[0].date, toDate: days[days.length - 1].date, days: days.length,
    erpMt: erpDays.length ? sum(erpDays.map((d) => d.erpMt!)) : null,
    erpDays: erpDays.length,
    influxMt: infDays.length ? sum(infDays.map((d) => d.influxMt!)) : null,
    influxFullDays: days.filter((d) => d.influxCoverage === 'full').length,
    comparedDays: compared.length,
    varianceMt: variance,
    variancePct: variance !== null && cmpErp ? round2((variance / cmpErp) * 100) : null,
    ...netOf(infDays),
  };
}

/** By-products and net production over the days the counter has data. */
function netOf(infDays: DayValue[]): Pick<PeriodRow, 'byProducts' | 'byProductDays' | 'netMt'> {
  if (!infDays.some((d) => d.byProducts !== undefined)) return {};
  const booked = infDays.filter((d) => d.byProducts);
  if (!booked.length) return { byProducts: null, byProductDays: 0, netMt: null };
  const byProducts = Object.fromEntries(
    BY_PRODUCT_KEYS.map((k) => [k, round2(booked.reduce((a, d) => a + d.byProducts![k], 0))]),
  ) as ByProducts;
  const influx = infDays.reduce((a, d) => a + d.influxMt!, 0);
  return { byProducts, byProductDays: booked.length, netMt: round2(influx - byProductTotal(byProducts)) };
}

/* -------------------------------- sources -------------------------------- */

export interface CounterRead {
  connection: 'up' | 'down';
  message: string;
  increments: Increment[];
  firstReadingAt: number | null;
  lastReadingAt: number | null;
}

/**
 * Only the counter's INCREASES in the window, computed in the historian: `difference`
 * with nonNegative drops each reset (a fall to 0 is a reset, never negative production),
 * and zero steps are filtered out — a day is ~200 rows, not ~8 600 raw readings. The query
 * starts an hour early so the first increase inside the window has its predecessor.
 */
export async function readCounter(env: Env, t: TagDef, fromMs: number, toMs: number): Promise<CounterRead> {
  const none = { increments: [], firstReadingAt: null, lastReadingAt: null };
  if (!historianConfigured(env)) return { connection: 'down', message: MSG.HISTORIAN_NOT_CONFIGURED, ...none };
  const sel = `from(bucket: "${esc(env.influxBucket!)}")
  |> range(start: ${fluxTime(fromMs - H_MS)}, stop: ${fluxTime(toMs)})
  |> filter(fn: (r) => r._measurement == "${esc(t.measurement)}" and r.Unit == "${esc(t.unitTag)}" and r.Group == "${esc(t.group!)}" and r._field == "${esc(t.field)}")`;
  try {
    const q = queryApi(env.influxUrl!, env.influxToken ?? `${env.influxUser}:${env.influxPassword ?? ''}`, env.influxOrg, 120_000);
    const [inc, first, last] = await Promise.all([
      collect<{ _time: string; _value: number }>(q, `${sel}
  |> difference(nonNegative: true)
  |> filter(fn: (r) => r._value > 0.0)
  |> keep(columns: ["_time", "_value"])`),
      collect<{ _time: string }>(q, `${sel} |> first() |> keep(columns: ["_time"])`),
      collect<{ _time: string }>(q, `${sel} |> last() |> keep(columns: ["_time"])`),
    ]);
    const increments = inc
      .map((r) => ({ t: Date.parse(r._time), v: Number(r._value) }))
      .filter((p) => p.t >= fromMs && Number.isFinite(p.v));
    const at = (rows: { _time: string }[]) => (rows[0] ? Date.parse(rows[0]._time) : null);
    return { connection: 'up', message: MSG.HISTORIAN_UP, increments, firstReadingAt: at(first), lastReadingAt: at(last) };
  } catch {
    return { connection: 'down', message: MSG.HISTORIAN_UNREACHABLE, ...none };
  }
}

/**
 * One ERP log-sheet field against one resetting Influx counter, per plant day. Production
 * (PRODUCTION_MT vs Total_Production_Ton) and billets (INPUT_PCS vs Dicharged_Billet) use
 * the same arithmetic, so a rule fixed for one is fixed for both.
 */
export interface CounterSpec {
  key: string;
  tag: TagDef;
  /** The ERP value of one log-sheet voucher. */
  erp: (r: ErpProductionRow) => number | null;
  /** Drop counter ticks with no billet behind them (counterEvents.ts `denoise`). */
  denoise?: boolean;
  /** Attach the four ERP by-products per day, and net production. */
  byProducts?: boolean;
}

export const PRODUCTION_SPEC: CounterSpec = { key: 'production', tag: HSM_TOTAL_PRODUCTION, erp: (r) => r.mt, denoise: true, byProducts: true };

const memo = new Map<string, { at: number; value: Promise<ProductionComparison> }>();
const MEMO_MS = 60_000;

export function productionComparison(
  env: Env, from: string, to: string, grain: Grain, nowMs = Date.now(),
): Promise<ProductionComparison> {
  return counterComparison(env, PRODUCTION_SPEC, from, to, grain, nowMs);
}

export function counterComparison(
  env: Env, spec: CounterSpec, from: string, to: string, grain: Grain, nowMs = Date.now(),
): Promise<ProductionComparison> {
  const key = `${spec.key}|${from}|${to}|${grain}`;
  const hit = memo.get(key);
  if (hit && nowMs - hit.at < MEMO_MS) return hit.value;
  const value = compute(env, spec, from, to, grain, nowMs);
  memo.set(key, { at: nowMs, value });
  value.catch(() => memo.delete(key));
  if (memo.size > 32) memo.delete(memo.keys().next().value!);
  return value;
}

async function compute(env: Env, spec: CounterSpec, from: string, to: string, grain: Grain, nowMs: number): Promise<ProductionComparison> {
  const dates = dateRange(from, to);
  const cache = readErpProduction(env);
  const erpRows = (cache?.rows ?? [])
    .filter((r) => r.date >= from && r.date <= to)
    .map((r) => ({ date: r.date, mt: spec.erp(r) }));
  // Production per plant day = the total of its reset events (counterEvents.ts).
  const fromMs = plantDayStart(from);
  const toMs = Math.min(plantDayStart(to) + DAY_MS, nowMs);
  const counter = await readCounterEvents(env, spec.tag, fromMs, toMs);
  let events = counterEvents(dates, counter, nowMs);
  // Noise: ticks with no billet discharged in the minutes before are dropped from their events.
  let noise: ProductionComparison['noise'] = { applied: false, ticks: 0, value: 0, windowMinutes: NOISE_WINDOW_MS / 60_000 };
  if (spec.denoise && counter.connection === 'up') {
    const [ticks, billets] = await Promise.all([
      readCounter(env, spec.tag, fromMs, toMs),
      readCounter(env, HSM_DISCHARGED_BILLET, fromMs - NOISE_WINDOW_MS, toMs),
    ]);
    if (ticks.connection === 'up' && billets.connection === 'up') {
      const { dropped } = denoise(ticks.increments, billets.increments);
      events = removeNoise(events, dropped);
      noise = { applied: true, ticks: dropped.length, value: round2(dropped.reduce((a, d) => a + d.v, 0)), windowMinutes: NOISE_WINDOW_MS / 60_000 };
    }
  }
  let days = buildDays(dates, erpRows, eventIncrements(events), counter.first?.t ?? null, counter.last?.t ?? null, nowMs);
  let byProductsLastDate: string | null = null;
  if (spec.byProducts) {
    const bp = readByProducts(env, from, to);
    byProductsLastDate = bp.lastDate;
    days = days.map((d) => ({ ...d, byProducts: bp.perDay.get(d.date) ?? null }));
  }
  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
  return {
    from, to, grain,
    dayBoundary: `${String(PLANT_DAY_START_HOUR).padStart(2, '0')}:00 IST`,
    erp: {
      connection: cache ? 'up' : 'down',
      message: cache ? MSG.ERP_UP : MSG.ERP_NOT_SYNCED,
      syncedAt: cache?.syncedAt ?? null,
      lastDate: cache?.rows.at(-1)?.date ?? null,
    },
    influx: {
      connection: counter.connection, message: counter.message,
      firstReadingAt: iso(counter.first?.t ?? null), lastReadingAt: iso(counter.last?.t ?? null),
    },
    noise,
    byProductsLastDate,
    events: events.map((e) => ({
      date: e.date, start: iso(e.start)!, end: iso(e.end)!,
      startValue: round2(e.startValue), endValue: round2(e.endValue), value: round2(e.value), noise: round2(e.noise),
      startedBy: e.startedBy, endedBy: e.endedBy,
    })),
    days,
    rows: aggregate(days, grain),
    totals: summarise('total', 'Total', days),
  };
}
