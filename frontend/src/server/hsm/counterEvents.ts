/**
 * A resetting counter (Total_Production_Ton, Dicharged_Billet) read as RESET EVENTS.
 *
 * The operator resets the counter to 0 now and then (at any hour, any number of times a
 * day). Each reset closes an event, and the event's production is
 *
 *     counter just before the reset − counter when the event started
 *
 * An event starts at the plant day's 06:00 (counter as it stood then) or at a reset (from
 * 0 — so anything already on the counter at the first reading after a reset is counted).
 * The last event of a day ends at the next 06:00, or at the latest reading while the day
 * is still running. A plant day's production is the total of its events.
 *
 * Why not "counter at day end − counter at day start": the counter is not reset at 06:00,
 * so that difference subtracts yesterday's running total and goes negative on reset days.
 */
import type { Env } from '../env';
import { MSG } from '../sources';
import { FRESH_MS, collect, esc, fluxTime, queryApi } from '../influx';
import { historianConfigured } from '../historian/client';
import type { TagDef } from '../historian/tags';
import { DAY_MS, plantDayStart, type Increment } from './production';

const H_MS = 3_600_000;

export interface Reset {
  /** First reading after the drop. */
  t: number;
  /** Counter just before the reset. */
  before: number;
  /** Counter at the first reading after it (normally 0). */
  after: number;
}

export interface CounterEventsRead {
  connection: 'up' | 'down';
  message: string;
  resets: Reset[];
  /** Counter as it stood at each plant-day boundary (06:00 IST), keyed by that instant. */
  atBoundary: Map<number, number>;
  first: { t: number; v: number } | null;
  last: { t: number; v: number } | null;
}

/** One piece of an event inside one plant day. */
export interface CounterEvent {
  /** Plant date the piece belongs to. */
  date: string;
  start: number;
  end: number;
  startValue: number;
  endValue: number;
  /** What the piece counts: endValue − startValue, less any noise inside it. */
  value: number;
  /** Noise removed from this piece (counter ticks with no billet behind them); 0 if none. */
  noise: number;
  startedBy: 'day start' | 'reset' | 'first reading';
  endedBy: 'reset' | 'day end' | 'latest reading';
}

/**
 * Three small queries: the resets (each drop with the value before and after), the
 * counter at every 06:00 IST boundary, and the first/last reading for coverage.
 */
export async function readCounterEvents(env: Env, t: TagDef, fromMs: number, toMs: number): Promise<CounterEventsRead> {
  const none = { resets: [], atBoundary: new Map<number, number>(), first: null, last: null };
  if (!historianConfigured(env)) return { connection: 'down', message: MSG.HISTORIAN_NOT_CONFIGURED, ...none };
  const q = queryApi(env.influxUrl!, env.influxToken ?? `${env.influxUser}:${env.influxPassword ?? ''}`, env.influxOrg, 120_000);
  const sel = (start: number) => `from(bucket: "${esc(env.influxBucket!)}")
  |> range(start: ${fluxTime(start)}, stop: ${fluxTime(toMs)})
  |> filter(fn: (r) => r._measurement == "${esc(t.measurement)}" and r.Unit == "${esc(t.unitTag)}" and r.Group == "${esc(t.group!)}" and r._field == "${esc(t.field)}")
  |> toFloat()`;
  try {
    const [drops, bounds, first, last] = await Promise.all([
      // difference() = after − before, stamped at the reading after; `v` keeps that reading.
      collect<{ _time: string; _value: number; v: number }>(q, `${sel(fromMs - H_MS)}
  |> duplicate(column: "_value", as: "v")
  |> difference()
  |> filter(fn: (r) => r._value < 0.0)
  |> keep(columns: ["_time", "_value", "v"])`),
      // Last reading of each 06:00 → 06:00 IST window, stamped at the window's end (offset
      // 30 m: UTC midnight + 00:30 = 06:00 IST).
      collect<{ _time: string; _value: number }>(q, `${sel(fromMs - DAY_MS)}
  |> aggregateWindow(every: 1d, offset: 30m, fn: last, createEmpty: false)
  |> keep(columns: ["_time", "_value"])`),
      collect<{ _time: string; _value: number }>(q, `${sel(fromMs - H_MS)} |> first() |> keep(columns: ["_time", "_value"])`),
      collect<{ _time: string; _value: number }>(q, `${sel(fromMs - H_MS)} |> last() |> keep(columns: ["_time", "_value"])`),
    ]);
    const pt = (r?: { _time: string; _value: number }) => (r ? { t: Date.parse(r._time), v: Number(r._value) } : null);
    return {
      connection: 'up', message: MSG.HISTORIAN_UP,
      resets: drops
        .map((r) => ({ t: Date.parse(r._time), after: Number(r.v), before: Number(r.v) - Number(r._value) }))
        .filter((r) => r.t >= fromMs && Number.isFinite(r.before))
        .sort((a, b) => a.t - b.t),
      atBoundary: new Map(bounds.map((r) => [Date.parse(r._time), Number(r._value)])),
      first: pt(first[0]),
      last: pt(last[0]),
    };
  } catch {
    return { connection: 'down', message: MSG.HISTORIAN_UNREACHABLE, ...none };
  }
}

/**
 * Split the counter into events, per plant day. Pure. A day the counter did not reach
 * has no events; a day it only partly covered starts at its first reading or ends at the
 * latest one.
 */
export function counterEvents(
  dates: string[], c: Pick<CounterEventsRead, 'resets' | 'atBoundary' | 'first' | 'last'>, nowMs: number,
): CounterEvent[] {
  const out: CounterEvent[] = [];
  if (!c.first || !c.last) return out;
  for (const date of dates) {
    const s = plantDayStart(date);
    const e = s + DAY_MS;
    if (c.first.t >= e || c.last.t < s) continue;          // no readings this day

    let curT: number; let cur: number; let startedBy: CounterEvent['startedBy'];
    if (c.first.t > s) { curT = c.first.t; cur = c.first.v; startedBy = 'first reading'; }
    else { curT = s; cur = c.atBoundary.get(s) ?? c.first.v; startedBy = 'day start'; }

    for (const r of c.resets) {
      if (r.t < s || r.t >= e) continue;
      out.push(piece(date, curT, r.t, cur, r.before, startedBy, 'reset'));
      curT = r.t; cur = 0; startedBy = 'reset';           // a new event counts from 0
    }
    // Still running (today), or the feed stopped mid-day: end at the latest reading. A day
    // whose last reading is seconds before its 06:00 end, and that 06:00 has passed, is complete.
    const running = e > nowMs || c.last.t < e - FRESH_MS;
    const endValue = running ? c.last.v : c.atBoundary.get(e) ?? c.last.v;
    out.push(piece(date, curT, running ? c.last.t : e, cur, endValue, startedBy, running ? 'latest reading' : 'day end'));
  }
  return out;
}

function piece(
  date: string, start: number, end: number, startValue: number, endValue: number,
  startedBy: CounterEvent['startedBy'], endedBy: CounterEvent['endedBy'],
): CounterEvent {
  // A piece cannot be negative: a fall that is not a reset is a counter glitch, not output.
  // Unrounded here — the day totals round once, so events never drift a cent from them.
  return { date, start, end, startValue, endValue, value: Math.max(0, endValue - startValue), noise: 0, startedBy, endedBy };
}

/** Events as dated amounts, for the per-day sums (each stamped inside its own plant day). */
export const eventIncrements = (events: CounterEvent[]): Increment[] =>
  events.map((e) => ({ t: Math.max(e.start, e.end - 1), v: e.value }));

/* --------------------------------- noise ---------------------------------- */

/**
 * After an operator reset the production counter sometimes ticks up with no billet going
 * into the mill (e.g. 29 Sep 07:01–07:06, three ticks before the day's first billet at
 * 07:59). A real tick always follows a billet discharge — normally within a minute. So:
 * a tick counts only if a billet went in during the NOISE_WINDOW_MS before it, and each
 * billet can stand behind one tick only. Measured over 22 Sep – 3 Oct 2026: 21 noise
 * ticks, the same with a 5- or a 10-minute window.
 */
export const NOISE_WINDOW_MS = 5 * 60_000;

/** Split counter ticks into kept and noise, matching each tick to the earliest unused billet in the window. Pure. */
export function denoise(
  ticks: Increment[], billets: Increment[], windowMs = NOISE_WINDOW_MS,
): { kept: Increment[]; dropped: Increment[] } {
  // One slot per billet (a reading can carry two billets).
  const slots: number[] = [];
  for (const b of [...billets].sort((x, y) => x.t - y.t)) for (let i = 0; i < Math.round(b.v); i += 1) slots.push(b.t);
  const kept: Increment[] = [];
  const dropped: Increment[] = [];
  let next = 0;
  for (const tick of [...ticks].sort((x, y) => x.t - y.t)) {
    while (next < slots.length && tick.t - slots[next] > windowMs) next += 1;   // too old to explain this tick
    if (next < slots.length && slots[next] <= tick.t) { kept.push(tick); next += 1; } else dropped.push(tick);
  }
  return { kept, dropped };
}

/** Take the noise ticks off the reset events they fall in (start < t ≤ end). Pure. */
export function removeNoise(events: CounterEvent[], dropped: Increment[]): CounterEvent[] {
  return events.map((e) => {
    const noise = dropped.filter((d) => d.t > e.start && d.t <= e.end).reduce((a, d) => a + d.v, 0);
    return noise ? { ...e, noise, value: Math.max(0, e.endValue - e.startValue - noise) } : e;
  });
}
