/**
 * RMD · Visualization — ILLUSTRATIVE figures from the approved comp (16 Sep 2026), not plant
 * data. The screen reads only this file, through `rmdView()`, so wiring the live sources
 * later replaces this one input and nothing else.
 *
 * Only primary figures are entered; every ratio the screen shows (yield, % of plan, running
 * rate, specific energy, shares, plan gap, availability, billet rate) is derived in
 * `rmdView()`, so the sample stays internally consistent.
 */

export interface RmdInput {
  /** The day the figures stand for, and whether it is closed. */
  day: { date: string; closed: boolean };
  billetsIn: number;
  billetInputMt: number;
  /** Finished output split by order link. */
  output: { withOrderMt: number; withoutOrderMt: number };
  energyMwh: number;
  run: { runH: number; nonRunH: number };
  shifts: { name: string; planMt: number; outputMt: number }[];
  /** Mill zones in rolling order: a count, or a state. */
  mimic: { infeedBillets: number; roughing: 'Running' | 'Idle' | 'Stopped'; route: 'Active' | 'Idle'; finishing: 'Running' | 'Idle' | 'Stopped' };
  /** Finished stock at the period end, per bar size. */
  stock: { size: string; withOrderMt: number; freeMt: number }[];
  /** Share of open order quantity covered by stock marked for it, %. */
  orderCoverPct: number;
}

export const RMD_SAMPLE: RmdInput = {
  day: { date: '2026-09-16', closed: true },
  billetsIn: 328,
  billetInputMt: 410.0,
  output: { withOrderMt: 308.0, withoutOrderMt: 91.0 },
  energyMwh: 33.52,
  run: { runH: 22.0, nonRunH: 2.0 },
  shifts: [
    { name: 'Shift A', planMt: 140, outputMt: 134.0 },
    { name: 'Shift B', planMt: 140, outputMt: 136.0 },
    { name: 'Shift C', planMt: 140, outputMt: 129.0 },
  ],
  mimic: { infeedBillets: 328, roughing: 'Running', route: 'Active', finishing: 'Running' },
  stock: [
    { size: '8 mm', withOrderMt: 160, freeMt: 80 },
    { size: '10 mm', withOrderMt: 145, freeMt: 70 },
    { size: '12 mm', withOrderMt: 125, freeMt: 60 },
    { size: '16 mm', withOrderMt: 110, freeMt: 50 },
  ],
  orderCoverPct: 75.0,
};

const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);

/** Everything the screen draws, derived from the input. */
export function rmdView(s: RmdInput) {
  const productionMt = s.output.withOrderMt + s.output.withoutOrderMt;
  const planMt = s.shifts.reduce((a, x) => a + x.planMt, 0);
  const stockWithOrderMt = s.stock.reduce((a, x) => a + x.withOrderMt, 0);
  const stockFreeMt = s.stock.reduce((a, x) => a + x.freeMt, 0);
  const stockMt = stockWithOrderMt + stockFreeMt;
  const hours = s.run.runH + s.run.nonRunH;
  return {
    ...s,
    productionMt,
    planMt,
    planPct: pct(productionMt, planMt),
    planGapMt: planMt - productionMt,
    yieldPct: pct(productionMt, s.billetInputMt),
    massDiffMt: s.billetInputMt - productionMt,
    massDiffPct: pct(s.billetInputMt - productionMt, s.billetInputMt),
    runningRateTph: s.run.runH ? productionMt / s.run.runH : 0,
    billetRatePerH: s.run.runH ? s.billetsIn / s.run.runH : 0,
    availabilityPct: pct(s.run.runH, hours),
    specificEnergyKwhPerMt: productionMt ? (s.energyMwh * 1000) / productionMt : 0,
    withoutOrderPct: pct(s.output.withoutOrderMt, productionMt),
    stockMt,
    stockWithOrderMt,
    stockFreeMt,
    stockWithOrderPct: pct(stockWithOrderMt, stockMt),
    stockFreePct: pct(stockFreeMt, stockMt),
  };
}

export type RmdView = ReturnType<typeof rmdView>;
