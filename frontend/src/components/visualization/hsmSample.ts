/**
 * HSM — sample model input for one plant day (16 Sep 2026, 06:00 → 06:00 IST).
 *
 * Deliberately static: data wiring is a later step, and it replaces this one object
 * without touching a component. The figures reproduce the approved comp (342.0 MT out
 * of 354.0 MT fed, 282 billets, 30.78 MWh, 21.6 h run) and every balance check closes.
 */
import type { Basis, MillFlowInput, Qty } from '@/models/millFlow';
import type { MillModelInput, ShiftInput } from '@/models/millModel';
import type { OperatingInput, PowerSample } from '@/models/operating';

const MIN = 60_000;
const H = 3_600_000;
/** 06:00 IST on 16 Sep 2026 = 00:30 UTC — the plant day starts with the Day shift. */
const DAY_START = Date.UTC(2026, 8, 16, 0, 30);
const DAY_END = DAY_START + 24 * H;

const billets = (count: number, mt: number, basis: Basis = 'measured'): Qty =>
  ({ mt, count, countUnit: 'billet', basis });
const tonnes = (mt: number, basis: Basis = 'measured'): Qty =>
  ({ mt, count: null, countUnit: null, basis });

/* --------------------------------- flow ---------------------------------- */

const flow: MillFlowInput = {
  cohort: { fromMs: DAY_START, toMs: DAY_END, asOfMs: DAY_END + 6 * H },
  fed: billets(282, 354.0),
  inlineReject: {
    ...billets(3, 3.8, 'entered'),
    reasons: [
      { code: 'cobble', label: 'Cobble', qty: billets(2, 2.5, 'entered') },
      { code: 'furnace', label: 'Furnace reject', qty: billets(1, 1.3, 'entered') },
    ],
  },
  output: {
    ...tonnes(342.0),
    withOrder: tonnes(270.0),
    free: tonnes(72.0),
    bySize: [
      { size: '8 mm', withOrder: 90, free: 20 },
      { size: '10 mm', withOrder: 70, free: 18 },
      { size: '12 mm', withOrder: 60, free: 18 },
      { size: '16 mm', withOrder: 50, free: 16 },
    ],
  },
  qc: { accepted: tonnes(330.0), rejected: tonnes(4.0), onHold: tonnes(8.0) },
  accepted: {
    withOrder: tonnes(262.0),
    free: tonnes(68.0),
    bySize: [
      { size: '8 mm', withOrder: 88, free: 19 },
      { size: '10 mm', withOrder: 68, free: 17 },
      { size: '12 mm', withOrder: 58, free: 17 },
      { size: '16 mm', withOrder: 48, free: 15 },
    ],
  },
};

/* -------------------------------- shifts --------------------------------- */

/** Two 12-hour shifts: Day 06:00–18:00, Night 18:00–06:00 IST. */
const shift = (name: ShiftInput['name'], i: number, fed: Qty, inline: Qty, out: number): ShiftInput => ({
  name,
  fromMs: DAY_START + i * 12 * H,
  toMs: DAY_START + (i + 1) * 12 * H,
  planMt: 180,
  fed,
  inlineReject: inline,
  output: tonnes(out),
});

const shifts: ShiftInput[] = [
  shift('Day', 0, billets(141, 177.2), billets(2, 2.5, 'entered'), 172.0),
  shift('Night', 1, billets(141, 176.8), billets(1, 1.3, 'entered'), 170.0),
];

/* ----------------------------- power readings ----------------------------- */

/** Stops, as [start minute from 06:00, length in minutes]. 54 + 36 + 54 = 144 min = 2.4 h. */
const STOPS: [number, number][] = [
  [190, 30], [361, 24], [692, 36],   // Day shift: 09:10, 12:01, 17:32
  [1141, 20], [1300, 34],             // Night shift: 01:01, 03:40
];
const IDLE_DRAW_KW = 320;
/** Energy on the comp for the day. */
const DAY_MWH = 30.78;

/**
 * One reading a minute. While running, every sixth minute is a one-minute dip to idle
 * — the gap between two billets, which must NOT count as a stop. The rolling draw is
 * scaled so the day comes to exactly the comp's 30.78 MWh.
 */
function samplePower(): PowerSample[] {
  const stopped = new Set<number>();
  for (const [at, len] of STOPS) for (let m = at; m < at + len; m += 1) stopped.add(m);
  const minutes = 24 * 60;
  const isGap = (m: number) =>
    !stopped.has(m) && m % 6 === 5 && !stopped.has(m - 1) && !stopped.has(m + 1);
  const idleMinutes = [...Array(minutes).keys()].filter((m) => stopped.has(m) || isGap(m)).length;
  const rollingKw = (DAY_MWH * 1000 * 60 - IDLE_DRAW_KW * idleMinutes) / (minutes - idleMinutes);
  return [...Array(minutes).keys()].map((m) => ({
    ts: DAY_START + m * MIN,
    kw: stopped.has(m) || isGap(m) ? IDLE_DRAW_KW : rollingKw,
  }));
}

const operating: OperatingInput = {
  meter: 'HSM stand drives (sample)',
  detection: { idleKw: 600, minStopMin: 3, stepMs: MIN },
  series: samplePower(),
};

/* --------------------------------- stock ---------------------------------- */

const size = (
  s: string,
  opening: [number, number], received: [number, number],
  allocated: number, dispatched: number, closing: [number, number],
) => ({
  size: s,
  opening: { withOrder: opening[0], free: opening[1] },
  received: { withOrder: received[0], free: received[1] },
  allocated,
  dispatched,
  closing: { withOrder: closing[0], free: closing[1] },
});

/* ------------------------------ whole model ------------------------------- */

export const HSM_SAMPLE: MillModelInput = {
  window: { fromMs: DAY_START, toMs: DAY_END },
  flow,
  shifts,
  operating,
  stock: {
    // received = the day's accepted material by size (see flow.accepted.bySize)
    sizes: [
      size('8 mm', [172, 61], [88, 19], 20, 150, [130, 60]),
      size('10 mm', [152, 43], [68, 17], 10, 120, [110, 50]),
      size('12 mm', [127, 48], [58, 17], 15, 100, [100, 50]),
      size('16 mm', [97, 40], [48, 15], 5, 70, [80, 50]),
    ],
  },
  orders: [
    // The worked example: 500 MT ordered, 100 MT marked from free stock, 400 MT produced.
    { id: 'SO-2611', size: '12 mm', qtyMt: 500, fromStockMt: 100, producedMt: 400, dispatchedMt: 250 },
    { id: 'SO-2618', size: '8 mm', qtyMt: 300, fromStockMt: 20, producedMt: 180, dispatchedMt: 150 },
    { id: 'SO-2622', size: '10 mm', qtyMt: 250, fromStockMt: 10, producedMt: 90, dispatchedMt: 60 },
  ],
  mimic: { roughing: 'Running', intermediate: 'Running', finishing: 'Running' },
};
