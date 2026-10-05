/**
 * Order fulfilment. An order is filled from two sources: free stock marked against it,
 * and fresh production with order for the rest.
 *
 *   e.g. order 500 MT, 100 MT free stock marked → produce 400 MT with order
 *
 * Produced material waits in the warehouse (QC, cooling) before dispatch, so
 * `dispatched` can lag both.
 */
import { BALANCE_TOLERANCE_MT, type BalanceCheck, type Size } from './millFlow';

export interface OrderInput {
  id: string;
  size: Size;
  qtyMt: number;
  /** Free stock marked against this order. */
  fromStockMt: number;
  /** Produced with order so far (accepted). */
  producedMt: number;
  dispatchedMt: number;
}

export interface Order extends OrderInput {
  /** Still to produce: qty − from stock − produced. */
  toProduceMt: number;
  /** Covered but not yet dispatched — sitting in the warehouse, marked with order. */
  awaitingDispatchMt: number;
}

export interface Orders { orders: Order[]; checks: BalanceCheck[] }

export function resolveOrders(input: OrderInput[]): Orders {
  const orders = input.map((o) => ({
    ...o,
    toProduceMt: o.qtyMt - o.fromStockMt - o.producedMt,
    awaitingDispatchMt: o.fromStockMt + o.producedMt - o.dispatchedMt,
  }));
  // Over-covering an order, or dispatching more than covers it, is a data problem.
  const checks: BalanceCheck[] = orders.flatMap((o) => [
    {
      id: `order.${o.id}.cover`, label: `${o.id}: from stock + produced ≤ order`,
      total: o.qtyMt, parts: o.fromStockMt + o.producedMt, gap: o.toProduceMt,
      ok: o.toProduceMt >= -BALANCE_TOLERANCE_MT,
    },
    {
      id: `order.${o.id}.dispatch`, label: `${o.id}: dispatched ≤ covered`,
      total: o.fromStockMt + o.producedMt, parts: o.dispatchedMt, gap: o.awaitingDispatchMt,
      ok: o.awaitingDispatchMt >= -BALANCE_TOLERANCE_MT,
    },
  ]);
  return { orders, checks };
}
