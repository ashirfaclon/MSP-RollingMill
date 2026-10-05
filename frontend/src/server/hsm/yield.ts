/**
 * Mass yield two ways, side by side, per plant day / week / month:
 *
 *   ERP     Σ PRODUCTION_MT ÷ Σ INPUT_MT from the Production Log Sheet (erpKpis.ts).
 *   Influx  output ÷ input from the historian:
 *             input  = Σ over billet-size EVENTS of (billets discharged in the event ×
 *                      the billet weight of that event) — see `sizeEvents`;
 *             output = Total_Production_Ton as reset events (counterEvents.ts), MT.
 *
 * Billet weight, with the units the historian publishes them in:
 *   length  Billet_Length_1_5_3M   m
 *   breadth Billet_Width_mm        mm  → ÷ 1000 → m
 *   height  Billet_Height_mm       mm  → ÷ 1000 → m
 *   volume  L × B × H              m³
 *   density 7.832 g/cm³ = 7.832 t/m³   (1 g/cm³ = 1 000 kg/m³ = 1 t/m³)
 *   weight  volume × density       t  (= MT, the unit of Total_Production_Ton)
 * e.g. 3 m × 0.275 m × 0.125 m = 0.103125 m³ × 7.832 = 0.8077 t per billet.
 *
 * Shown together at the plant's request. The Influx output is not weighed — the PLC
 * computes it as coils counted × the same set billet weight — so the Influx yield is in
 * effect coils ÷ billets and sits near 100 %. The coil and billet counts are returned too,
 * so the reason is visible next to the number.
 */
import type { Env } from '../env';
import { MSG } from '../sources';
import { collect, esc, fluxTime, queryApi } from '../influx';
import { historianConfigured } from '../historian/client';
import { HSM_DISCHARGED_BILLET, HSM_TOTAL_PRODUCTION, type TagDef } from '../historian/tags';
import { readErpProduction } from '../erp/cache';
import {
  DAY_MS, buildDays, dateRange, periodOf, plantDayStart, readCounter, round2,
  type DayValue, type Grain, type Increment,
} from './production';
import { buildLogDays, type ErpMeta } from './erpKpis';
import { counterEvents, eventIncrements, readCounterEvents } from './counterEvents';

const H_MS = 3_600_000;

/** Steel density, g/cm³ — the plant's formula book value. (The PLC's own tags use 7.85.) */
export const STEEL_DENSITY_G_CM3 = 7.832;
/** g/cm³ → t/m³: 1 g/cm³ = 1 000 kg/m³ = 1 t/m³. */
const G_CM3_TO_T_M3 = 1;
const MM_TO_M = 1 / 1000;

/** Billet weight in t (= MT) from the historian's units: length m, breadth and height mm. */
export const billetWeightT = (lengthM: number, breadthMm: number, heightMm: number) =>
  lengthM * (breadthMm * MM_TO_M) * (heightMm * MM_TO_M) * STEEL_DENSITY_G_CM3 * G_CM3_TO_T_M3;

const general = (field: string, unit: string): TagDef => ({
  key: `hsm_${field.toLowerCase()}`, label: field, measurement: 'HSM', unitTag: 'Finishing Mill', group: 'General',
  field, unit, scale: 1, mapped: true,
});
const HEIGHT = general('Billet_Height_mm', 'mm');
const WIDTH = general('Billet_Width_mm', 'mm');
const LENGTH = general('Billet_Length_1_5_3M', 'm');
const COILS = general('Fineshed_Coil', 'pcs');

/** A setpoint as a step function: value from `t` until the next step. */
export type Steps = { t: number; v: number }[];

export const valueAt = (steps: Steps, t: number): number | null => {
  let v: number | null = null;
  for (const s of steps) { if (s.t <= t) v = s.v; else break; }
  return v;
};

/**
 * Changes this close together are one size change: the operator sets breadth and height
 * and then length a few seconds later (23 Sep 06:16:28 / 06:16:38), and the half-set size
 * in between is not a billet anyone rolled.
 */
export const SETTLE_MS = 60_000;

/** One billet size, in force from `start` until the next event (`end` null = still in force). */
export interface SizeEvent {
  start: number;
  end: number | null;
  lengthM: number;
  breadthMm: number;
  heightMm: number;
  weightT: number;
}

/**
 * The billet-size events: every change of length, breadth or height starts a new event,
 * changes within SETTLE_MS of each other are one event, and the event takes the size as
 * it stands once they have all landed. Pure.
 */
export function sizeEvents(h: Steps, w: Steps, l: Steps): SizeEvent[] {
  if (!h.length || !w.length || !l.length) return [];
  const first = Math.max(h[0].t, w[0].t, l[0].t);
  const times = [...new Set([...h, ...w, ...l].map((s) => s.t).filter((t) => t > first))].sort((a, b) => a - b);
  const starts: { start: number; settled: number }[] = [{ start: first, settled: first }];
  for (const t of times) {
    const cur = starts[starts.length - 1];
    if (t - cur.start <= SETTLE_MS) cur.settled = t; else starts.push({ start: t, settled: t });
  }
  const events: SizeEvent[] = [];
  for (const s of starts) {
    const lengthM = valueAt(l, s.settled)!; const breadthMm = valueAt(w, s.settled)!; const heightMm = valueAt(h, s.settled)!;
    const prev = events[events.length - 1];
    // A change that lands back on the same size is not a new event.
    if (prev && prev.lengthM === lengthM && prev.breadthMm === breadthMm && prev.heightMm === heightMm) continue;
    if (prev) prev.end = s.start;
    events.push({ start: s.start, end: null, lengthM, breadthMm, heightMm, weightT: billetWeightT(lengthM, breadthMm, heightMm) });
  }
  return events;
}

const eventAt = (events: SizeEvent[], t: number) => {
  let e: SizeEvent | null = null;
  for (const x of events) { if (x.start <= t) e = x; else break; }
  return e;
};

/**
 * Tonnes charged: each billet increase × the weight of the size event it fell in. Pure.
 * A billet before the first known size is left out and counted in `unweighed`.
 */
export function weighBillets(billets: Increment[], events: SizeEvent[]): { tonnes: Increment[]; unweighed: number } {
  const tonnes: Increment[] = [];
  let unweighed = 0;
  for (const b of billets) {
    const e = eventAt(events, b.t);
    if (!e) { unweighed += b.v; continue; }
    tonnes.push({ t: b.t, v: b.v * e.weightT });
  }
  return { tonnes, unweighed };
}

/** A setpoint's value at the window start and every change inside it — a few rows, not ~8 600 a day. */
async function readSteps(env: Env, t: TagDef, fromMs: number, toMs: number): Promise<Steps> {
  const q = queryApi(env.influxUrl!, env.influxToken ?? `${env.influxUser}:${env.influxPassword ?? ''}`, env.influxOrg, 120_000);
  const sel = `from(bucket: "${esc(env.influxBucket!)}")
  |> range(start: ${fluxTime(fromMs - 6 * H_MS)}, stop: ${fluxTime(toMs)})
  |> filter(fn: (r) => r._measurement == "${esc(t.measurement)}" and r.Unit == "${esc(t.unitTag)}" and r.Group == "${esc(t.group!)}" and r._field == "${esc(t.field)}")
  |> toFloat()`;
  const [first, changes] = await Promise.all([
    collect<{ _time: string; _value: number }>(q, `${sel} |> first() |> keep(columns: ["_time", "_value"])`),
    collect<{ _time: string; v: number }>(q, `${sel}
  |> duplicate(column: "_value", as: "v")
  |> difference()
  |> filter(fn: (r) => r._value != 0.0)
  |> keep(columns: ["_time", "v"])`),
  ]);
  return [
    ...first.map((r) => ({ t: Date.parse(r._time), v: Number(r._value) })),
    ...changes.map((r) => ({ t: Date.parse(r._time), v: Number(r.v) })),
  ].filter((s) => Number.isFinite(s.v)).sort((a, b) => a.t - b.t);
}

/* ------------------------------ aggregation ------------------------------ */

export interface YieldDay {
  date: string;
  erpInputMt: number | null;
  erpOutputMt: number | null;
  /** Influx figures are null when the historian had no readings that day. */
  influxInputT: number | null;
  influxOutputT: number | null;
  billets: number | null;
  coils: number | null;
  influxCoverage: DayValue['influxCoverage'];
}

export interface YieldPeriod {
  key: string;
  label: string;
  fromDate: string;
  toDate: string;
  days: number;
  erpDays: number;
  erpInputMt: number | null;
  erpOutputMt: number | null;
  erpYieldPct: number | null;
  /** Days with any historian reading (today counts, still running). */
  influxDays: number;
  influxFullDays: number;
  influxInputT: number | null;
  influxOutputT: number | null;
  influxYieldPct: number | null;
  billets: number | null;
  coils: number | null;
}

const pct = (out: number | null, inp: number | null) => (out === null || !inp ? null : round2((out / inp) * 100));

export function summariseYield(key: string, label: string, days: YieldDay[]): YieldPeriod {
  const e = days.filter((d) => d.erpInputMt !== null);
  const i = days.filter((d) => d.influxCoverage !== 'none' && d.influxInputT !== null);
  const s = (xs: YieldDay[], k: keyof YieldDay) => (xs.length ? round2(xs.reduce((a, d) => a + ((d[k] as number | null) ?? 0), 0)) : null);
  const erpInputMt = s(e, 'erpInputMt');
  const erpOutputMt = s(e, 'erpOutputMt');
  const influxInputT = s(i, 'influxInputT');
  const influxOutputT = s(i, 'influxOutputT');
  return {
    key, label, fromDate: days[0].date, toDate: days[days.length - 1].date, days: days.length,
    erpDays: e.length, erpInputMt, erpOutputMt, erpYieldPct: pct(erpOutputMt, erpInputMt),
    influxDays: i.length, influxFullDays: i.filter((d) => d.influxCoverage === 'full').length,
    influxInputT, influxOutputT, influxYieldPct: pct(influxOutputT, influxInputT),
    billets: s(i, 'billets'), coils: s(i, 'coils'),
  };
}

export interface YieldComparison {
  from: string;
  to: string;
  grain: Grain;
  erp: ErpMeta;
  influx: { connection: 'up' | 'down'; message: string; unweighedBillets: number };
  /** Billet-size events in the window, oldest first. */
  sizeEvents: {
    start: string; end: string | null;
    lengthM: number; breadthMm: number; heightMm: number;
    /** t per billet. */
    weightT: number;
    /** Billets discharged inside the window while this size was set, and their tonnes. */
    billets: number; inputT: number;
  }[];
  /** g/cm³ used for the input. */
  densityGcm3: number;
  rows: YieldPeriod[];
  totals: YieldPeriod;
}

const memo = new Map<string, { at: number; value: Promise<YieldComparison> }>();

export function yieldComparison(env: Env, from: string, to: string, grain: Grain, nowMs = Date.now()): Promise<YieldComparison> {
  const key = `${from}|${to}|${grain}`;
  const hit = memo.get(key);
  if (hit && nowMs - hit.at < 60_000) return hit.value;
  const value = compute(env, from, to, grain, nowMs);
  memo.set(key, { at: nowMs, value });
  value.catch(() => memo.delete(key));
  if (memo.size > 32) memo.delete(memo.keys().next().value!);
  return value;
}

async function compute(env: Env, from: string, to: string, grain: Grain, nowMs: number): Promise<YieldComparison> {
  const dates = dateRange(from, to);
  const prod = readErpProduction(env);
  const erpDays = buildLogDays(dates, (prod?.rows ?? []).filter((r) => r.date >= from && r.date <= to), new Map());

  const fromMs = plantDayStart(from);
  const toMs = Math.min(plantDayStart(to) + DAY_MS, nowMs);
  let influx: YieldComparison['influx'] = { connection: 'down', message: MSG.HISTORIAN_NOT_CONFIGURED, unweighedBillets: 0 };
  let inputDays: DayValue[] | null = null;
  let outputDays: DayValue[] | null = null;
  let billetDays: DayValue[] | null = null;
  let coilDays: DayValue[] | null = null;
  let sizeLog: YieldComparison['sizeEvents'] = [];
  if (historianConfigured(env)) {
    try {
      const [out, bil, coil, h, w, l] = await Promise.all([
        readCounterEvents(env, HSM_TOTAL_PRODUCTION, fromMs, toMs),
        readCounter(env, HSM_DISCHARGED_BILLET, fromMs, toMs),
        readCounter(env, COILS, fromMs, toMs),
        readSteps(env, HEIGHT, fromMs, toMs), readSteps(env, WIDTH, fromMs, toMs), readSteps(env, LENGTH, fromMs, toMs),
      ]);
      if ([out, bil, coil].some((c) => c.connection === 'down')) throw new Error('historian');
      // Output = the production counter's reset events, the same figure as the Production card.
      const outIncrements = eventIncrements(counterEvents(dates, out, nowMs));
      const events = sizeEvents(h, w, l);
      const { tonnes, unweighed } = weighBillets(bil.increments, events);
      // The events that touch the window, each with the billets and tonnes it carried inside it.
      sizeLog = events
        .filter((e) => e.start < toMs && (e.end === null || e.end > fromMs))
        .map((e) => {
          const inside = (t: number) => t >= Math.max(e.start, fromMs) && t < Math.min(e.end ?? Infinity, toMs);
          const billets = bil.increments.filter((b) => inside(b.t)).reduce((a, b) => a + b.v, 0);
          return {
            start: new Date(e.start).toISOString(), end: e.end === null ? null : new Date(e.end).toISOString(),
            lengthM: e.lengthM, breadthMm: e.breadthMm, heightMm: e.heightMm,
            weightT: Math.round(e.weightT * 10_000) / 10_000,
            billets, inputT: round2(billets * e.weightT),
          };
        });
      const days = (c: typeof bil, inc: Increment[]) => buildDays(dates, [], inc, c.firstReadingAt, c.lastReadingAt, nowMs);
      outputDays = buildDays(dates, [], outIncrements, out.first?.t ?? null, out.last?.t ?? null, nowMs);
      inputDays = days(bil, tonnes);
      billetDays = days(bil, bil.increments);
      coilDays = days(coil, coil.increments);
      influx = { connection: 'up', message: MSG.HISTORIAN_UP, unweighedBillets: unweighed };
    } catch {
      influx = { connection: 'down', message: MSG.HISTORIAN_UNREACHABLE, unweighedBillets: 0 };
    }
  }

  const days: YieldDay[] = dates.map((date, n) => {
    const covIn = inputDays?.[n].influxCoverage ?? 'none';
    const covOut = outputDays?.[n].influxCoverage ?? 'none';
    const coverage = covIn === 'none' || covOut === 'none' ? 'none' : covIn === 'full' && covOut === 'full' ? 'full' : 'partial';
    return {
      date,
      erpInputMt: erpDays[n].inputMt,
      erpOutputMt: erpDays[n].productionMt,
      influxInputT: coverage === 'none' ? null : inputDays![n].influxMt,
      influxOutputT: coverage === 'none' ? null : outputDays![n].influxMt,
      billets: coverage === 'none' ? null : billetDays![n].influxMt,
      coils: coverage === 'none' ? null : coilDays![n].influxMt,
      influxCoverage: coverage,
    };
  });

  const groups = new Map<string, { label: string; days: YieldDay[] }>();
  for (const d of days) {
    const p = periodOf(d.date, grain);
    const g = groups.get(p.key) ?? { label: p.label, days: [] };
    g.days.push(d);
    groups.set(p.key, g);
  }

  return {
    from, to, grain,
    erp: {
      connection: prod ? 'up' : 'down', message: prod ? MSG.ERP_UP : MSG.ERP_NOT_SYNCED,
      syncedAt: prod?.syncedAt ?? null, lastDate: prod?.rows.at(-1)?.date ?? null,
    },
    influx,
    sizeEvents: sizeLog,
    densityGcm3: STEEL_DENSITY_G_CM3,
    rows: [...groups].map(([key, g]) => summariseYield(key, g.label, g.days)),
    totals: summariseYield('total', 'Total', days),
  };
}
