/**
 * One mill, one window — everything the Visualization screen shows, from one input.
 *
 *   flow       material, billet to warehouse (cohort)            millFlow.ts
 *   shifts     per-shift material + plan                          here
 *   operating  power readings → run hours, energy                 operating.ts
 *   stock      warehouse balance by size (running ledger)         stock.ts
 *   orders     fulfilment: from stock + produced + dispatched     orders.ts
 *
 * Every KPI on screen is computed here and nowhere else, so two panels can never
 * disagree about the same number. Yield is output ÷ billets fed.
 *
 * Shift credit: output goes to the shift that ROLLED it (how the floor counts it); fed
 * and inline reject go to the shift that charged / pulled them. The shift sums are
 * checked against the day.
 */
import {
  check, resolveFlow, round, sum, verdict,
  type BalanceCheck, type MillFlow, type MillFlowInput, type Qty,
} from './millFlow';
import { runTime, type OperatingInput, type RunDetection, type RunTime } from './operating';
import { resolveStock, type Stock, type StockInput } from './stock';
import { resolveOrders, type OrderInput, type Orders } from './orders';

/** Two 12-hour shifts per plant day: Day 06:00–18:00, Night 18:00–06:00 IST. */
export type ShiftName = 'Day' | 'Night';

export interface ShiftInput {
  name: ShiftName;
  fromMs: number;
  toMs: number;
  planMt: number | null;
  fed: Qty;
  inlineReject: Qty;
  output: Qty;
}

/** Stand-group running state for the mimic. */
export type GroupState = 'Running' | 'Idle' | 'Stopped';

export interface MillModelInput {
  window: { fromMs: number; toMs: number };
  flow: MillFlowInput;
  shifts: ShiftInput[];
  operating: OperatingInput;
  stock: StockInput;
  orders: OrderInput[];
  mimic: { roughing: GroupState; intermediate: GroupState; finishing: GroupState };
}

export interface Shift extends ShiftInput {
  run: RunTime;
  planPct: number | null;
  /** plan − output; positive = short. */
  planGap: number | null;
  runningRateTph: number | null;
  yieldPct: number | null;
}

export interface MillKpis {
  productionMt: number | null;
  planMt: number | null;
  planPct: number | null;
  planGapMt: number | null;
  /** Output ÷ billets fed. */
  yieldPct: number | null;
  billetsFed: number | null;
  billetInputMt: number | null;
  /** fed − output = inline reject + process loss. */
  massDiffMt: number | null;
  inlineRejectMt: number | null;
  processLossMt: number | null;

  runH: number | null;
  nonRunH: number | null;
  availabilityPct: number | null;
  runningRateTph: number | null;
  billetRatePerH: number | null;
  energyMwh: number | null;
  idleEnergyMwh: number | null;
  specificEnergyKwhPerMt: number | null;

  productionWithOrderMt: number | null;
  productionFreeMt: number | null;
  productionFreePct: number | null;
}

export interface MillModel {
  window: { fromMs: number; toMs: number };
  flow: MillFlow;
  shifts: Shift[];
  run: RunTime;
  /** Where run time came from and how a stop is decided — shown beside the result. */
  power: { meter: string; detection: RunDetection };
  stock: Stock;
  orders: Orders;
  mimic: MillModelInput['mimic'];
  kpis: MillKpis;
  /** Every check across the model. */
  checks: BalanceCheck[];
  balanced: boolean | null;
}

const ratio = (a: number | null, b: number | null, scale = 1) =>
  a === null || b === null || b === 0 ? null : (a / b) * scale;

export function resolveMill(input: MillModelInput): MillModel {
  const flow = resolveFlow(input.flow);
  const run = runTime(input.operating, input.window.fromMs, input.window.toMs);
  const stock = resolveStock(input.stock);
  const orders = resolveOrders(input.orders);

  const shifts: Shift[] = input.shifts.map((s) => {
    const r = runTime(input.operating, s.fromMs, s.toMs);
    return {
      ...s,
      run: r,
      planPct: ratio(s.output.mt, s.planMt, 100),
      planGap: round(s.planMt === null || s.output.mt === null ? null : s.output.mt - s.planMt),
      runningRateTph: ratio(s.output.mt, r.runH),
      yieldPct: ratio(s.output.mt, s.fed.mt, 100),
    };
  });

  const output = flow.output.mt;
  const fed = flow.fed.mt;
  const planMt = shifts.length ? sum(...shifts.map((s) => s.planMt)) : null;

  const kpis: MillKpis = {
    productionMt: output,
    planMt,
    planPct: ratio(output, planMt, 100),
    planGapMt: round(planMt === null || output === null ? null : output - planMt),
    yieldPct: ratio(output, fed, 100),
    billetsFed: flow.fed.count,
    billetInputMt: fed,
    massDiffMt: round(fed === null || output === null ? null : fed - output),
    inlineRejectMt: flow.inlineReject.mt,
    processLossMt: flow.processLoss.mt,

    runH: run.runH,
    nonRunH: run.stopH,
    availabilityPct: ratio(run.runH, run.windowH, 100),
    runningRateTph: ratio(output, run.runH),
    billetRatePerH: ratio(flow.fed.count, run.runH),
    energyMwh: run.energyMwh,
    idleEnergyMwh: run.idleEnergyMwh,
    specificEnergyKwhPerMt: ratio(run.energyMwh, output, 1000),

    productionWithOrderMt: flow.output.withOrder.mt,
    productionFreeMt: flow.output.free.mt,
    productionFreePct: ratio(flow.output.free.mt, output, 100),
  };

  const shiftSum = (pick: (s: ShiftInput) => number | null) =>
    shifts.length ? sum(...shifts.map(pick)) : null;
  const checks: BalanceCheck[] = [
    ...flow.checks,
    check('shifts.output', 'Day + Night shift output = day output', output, shiftSum((s) => s.output.mt)),
    check('shifts.fed', 'Day + Night shift billets fed = day', fed, shiftSum((s) => s.fed.mt)),
    check('shifts.inline', 'Day + Night shift inline reject = day', flow.inlineReject.mt, shiftSum((s) => s.inlineReject.mt)),
    // Missing power readings would otherwise shrink run AND stop hours silently.
    check('power.coverage', 'Power readings cover the whole window (h)', run.windowH, run.coveredH),
    ...stock.checks,
    ...orders.checks,
  ];

  return {
    window: input.window, flow, shifts, run,
    power: { meter: input.operating.meter, detection: input.operating.detection },
    stock, orders, mimic: input.mimic, kpis,
    checks, balanced: verdict(checks),
  };
}
