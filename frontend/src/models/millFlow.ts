/**
 * Material flow — a mass-balance ledger for one mill, billet in to warehouse.
 *
 * COHORT semantics: the figures follow the billets FED in the window through to their
 * status as of `asOfMs`. Material fed yesterday that clears hold today therefore moves
 * from `onHold` to `accepted` (or `rejected`) on yesterday's view. This is what lets the
 * chain close: every tonne fed ends up in exactly one terminal bucket.
 *
 *   fed ──▶ rolled ──▶ output ──▶ accepted ──┬─▶ with order → warehouse, marked for its order
 *    │        │       (with order    │        └─▶ free       → warehouse, free stock
 *    ▼        ▼        / free)       ├─▶ rejected → remelt, re-produced later
 * inline   process                   └─▶ on hold  → resolves to accepted or rejected
 * reject    loss
 *
 * "With order" is known at PRODUCTION: an order is placed first, free stock is marked
 * against it, and the balance is rolled as production with order. Nothing is dispatched
 * off the mill — accepted material of both kinds goes to the warehouse (QC, cooling) and
 * leaves later as a stock movement (see stock.ts).
 *
 * `rolled` and `processLoss` are DERIVED, never supplied: process loss (scale, crop ends,
 * un-weighed scrap) is whatever the measured stages cannot account for — a negative one
 * is a data problem, and the checks below say so.
 */

/** How a figure was obtained. Not rendered today, but the data must know. */
export type Basis = 'measured' | 'entered' | 'nominal' | 'derived';

export interface Qty {
  mt: number | null;
  /** null = not counted at this stage (e.g. crop ends are weighed, never counted). */
  count: number | null;
  countUnit: 'billet' | 'bundle' | null;
  basis: Basis;
}

export interface ReasonQty { code: string; label: string; qty: Qty }

/** Product size, e.g. "8 mm". */
export type Size = string;

/** One size's tonnage, split by order linkage. */
export interface SizeSplit { size: Size; withOrder: number | null; free: number | null }

/** A tonnage split by order linkage, with the same split per size. */
export interface OrderSplit { withOrder: Qty; free: Qty; bySize: SizeSplit[] }

/** What the sources report. */
export interface MillFlowInput {
  cohort: {
    fromMs: number;
    toMs: number;
    /** When QC status was read — hold resolves after the window closes. */
    asOfMs: number;
  } | null;

  /** Billets charged: counter at furnace entry, weight from billet transfer. */
  fed: Qty;
  /** Pulled before or during rolling — furnace rejects, cobbles. Billet-level, so countable. */
  inlineReject: Qty & { reasons: ReasonQty[] };
  /** Finished output off the cooling bed, split by whether an order was behind it. */
  output: Qty & OrderSplit;

  /** Quality disposition of `output`. */
  qc: {
    accepted: Qty;
    /** Failed QC: sent back to be melted and re-produced later. */
    rejected: Qty;
    /** Awaiting QC: will resolve to accepted or rejected. */
    onHold: Qty;
  };

  /** Accepted material, all of it into the warehouse, marked or free. */
  accepted: OrderSplit;
}

export interface BalanceCheck {
  id: string;
  label: string;
  /** Left-hand side, e.g. output MT. */
  total: number | null;
  /** Sum of the parts it should equal. */
  parts: number | null;
  /** total − parts; null when an input is missing. */
  gap: number | null;
  ok: boolean | null;
}

export interface MillFlow extends MillFlowInput {
  /** fed − inline reject. */
  rolled: Qty;
  /** fed − inline reject − output: scale, crop ends, un-weighed scrap. */
  processLoss: Qty;
  checks: BalanceCheck[];
  /** Every check passed (null if any could not be evaluated). */
  balanced: boolean | null;
}

/** Tolerance for rounding in reported tonnages. */
export const BALANCE_TOLERANCE_MT = 0.05;

export const sum = (...xs: (number | null)[]): number | null =>
  xs.some((x) => x === null) ? null : (xs as number[]).reduce((a, b) => a + b, 0);
export const diff = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : a - b;
/** Float noise from subtraction (354.0 − 3.8 − 342.0) must not print as 8.199999. */
export const round = (x: number | null, dp = 3): number | null =>
  x === null ? null : Math.round(x * 10 ** dp) / 10 ** dp;

/** total must equal parts, within tolerance. */
export function check(id: string, label: string, total: number | null, parts: number | null): BalanceCheck {
  const gap = round(diff(total, parts));
  return { id, label, total, parts, gap, ok: gap === null ? null : Math.abs(gap) <= BALANCE_TOLERANCE_MT };
}

/** Every check passed → true; any failed → false; otherwise unknown. */
export function verdict(checks: BalanceCheck[]): boolean | null {
  return checks.some((c) => c.ok === false) ? false
    : checks.some((c) => c.ok === null) ? null
    : true;
}

const sizeTotal = (rows: SizeSplit[], key: 'withOrder' | 'free') =>
  rows.length === 0 ? null : sum(...rows.map((r) => r[key]));

/** An order split must add up, overall and across its sizes. */
function splitChecks(id: string, name: string, total: Qty, split: OrderSplit): BalanceCheck[] {
  const out = [check(id, `${name} = with order + free`, total.mt, sum(split.withOrder.mt, split.free.mt))];
  if (split.bySize.length > 0) {
    out.push(
      check(`${id}.size.withOrder`, `${name} with order = sum of sizes`, split.withOrder.mt, sizeTotal(split.bySize, 'withOrder')),
      check(`${id}.size.free`, `${name} free = sum of sizes`, split.free.mt, sizeTotal(split.bySize, 'free')),
    );
  }
  return out;
}

/** Derive the missing stages and check that the chain closes. */
export function resolveFlow(input: MillFlowInput): MillFlow {
  const rolled: Qty = {
    mt: round(diff(input.fed.mt, input.inlineReject.mt)),
    count: diff(input.fed.count, input.inlineReject.count),
    countUnit: input.fed.countUnit,
    basis: 'derived',
  };
  const processLoss: Qty = {
    mt: round(diff(rolled.mt, input.output.mt)),
    count: null,
    countUnit: null,
    basis: 'derived',
  };

  const { qc } = input;
  const checks: BalanceCheck[] = [
    /*
     * Process loss absorbs whatever fed − inline reject − output leaves, so this check
     * cannot fail by being unequal — only by the remainder going negative, i.e. more
     * came out than went in. That is a data problem, never a gain.
     */
    {
      id: 'fed',
      label: 'Fed ≥ inline reject + output',
      total: input.fed.mt,
      parts: sum(input.inlineReject.mt, input.output.mt),
      gap: processLoss.mt,
      ok: processLoss.mt === null ? null : processLoss.mt >= -BALANCE_TOLERANCE_MT,
    },
    ...splitChecks('output', 'Output', input.output, input.output),
    check('qc', 'Output = accepted + rejected + on hold',
      input.output.mt, sum(qc.accepted.mt, qc.rejected.mt, qc.onHold.mt)),
    ...splitChecks('accepted', 'Accepted', qc.accepted, input.accepted),
  ];

  return { ...input, rolled, processLoss, checks, balanced: verdict(checks) };
}

/** Share of billets fed, in percent. */
export const pctOfFed = (flow: MillFlow, mt: number | null): number | null =>
  mt === null || !flow.fed.mt ? null : (mt / flow.fed.mt) * 100;
