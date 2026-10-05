/**
 * Finished stock by size — a running balance, not a cohort. It holds material made on
 * earlier days too, so it cannot come from the material flow; it is its own ledger
 * (ERP stock by item/size and order allocation).
 *
 * Material in the warehouse carries one of two marks:
 *   with order — produced against an order, or free stock later marked for one
 *   free       — no order behind it
 *
 * Marking free stock for an order (ALLOCATION) moves tonnes between the marks without
 * moving any steel. Only dispatch takes material out, and only material with an order
 * is dispatched. Per size, over the window:
 *
 *   closing with order = opening with order + received with order + allocated − dispatched
 *   closing free       = opening free       + received free       − allocated
 *
 * `received` is accepted material arriving from the mill in the window (a period
 * figure — the cohort flow's `accepted` is close but not the same thing, since hold
 * resolves after the window).
 */
import { check, sum, verdict, type BalanceCheck, type Size } from './millFlow';

export interface StockSizeInput {
  size: Size;
  opening: { withOrder: number | null; free: number | null };
  received: { withOrder: number | null; free: number | null };
  /** Free → with order, MT. */
  allocated: number | null;
  /** Out of the warehouse against orders, MT. */
  dispatched: number | null;
  /** Snapshot at window end — reported, then checked against the movements. */
  closing: { withOrder: number | null; free: number | null };
}

export interface StockInput { sizes: StockSizeInput[] }

export interface StockSize extends StockSizeInput {
  total: number | null;
}

export interface Stock {
  sizes: StockSize[];
  withOrder: number | null;
  free: number | null;
  total: number | null;
  /** Share of stock already marked for an order, %. */
  withOrderPct: number | null;
  freePct: number | null;
  allocated: number | null;
  dispatched: number | null;
  checks: BalanceCheck[];
  balanced: boolean | null;
}

const pct = (part: number | null, whole: number | null) =>
  part === null || !whole ? null : (part / whole) * 100;

export function resolveStock(input: StockInput): Stock {
  const sizes: StockSize[] = input.sizes.map((s) => ({
    ...s, total: sum(s.closing.withOrder, s.closing.free),
  }));

  const checks = input.sizes.flatMap((s) => [
    check(`stock.${s.size}.withOrder`, `${s.size} with order: opening + received + allocated − dispatched = closing`,
      s.closing.withOrder,
      sum(s.opening.withOrder, s.received.withOrder, s.allocated, s.dispatched === null ? null : -s.dispatched)),
    check(`stock.${s.size}.free`, `${s.size} free: opening + received − allocated = closing`,
      s.closing.free,
      sum(s.opening.free, s.received.free, s.allocated === null ? null : -s.allocated)),
  ]);

  const withOrder = sum(...sizes.map((s) => s.closing.withOrder));
  const free = sum(...sizes.map((s) => s.closing.free));
  const total = sum(withOrder, free);
  return {
    sizes,
    withOrder,
    free,
    total,
    withOrderPct: pct(withOrder, total),
    freePct: pct(free, total),
    allocated: sum(...sizes.map((s) => s.allocated)),
    dispatched: sum(...sizes.map((s) => s.dispatched)),
    checks,
    balanced: verdict(checks),
  };
}
