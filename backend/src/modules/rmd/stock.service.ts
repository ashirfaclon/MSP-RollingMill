/**
 * RMD finished stock by size: the plant's item list (stock-items.ts) in godown FGYRDP, from
 * the ERP item ledger — stock at the end of a date is every movement up to it, from the
 * 2023 opening. All of it is free stock (no order link); every item of one bar size is
 * summed. Left out, as the plant asked (16 Oct 2026): the items with no bar size (the former
 * 'Other' row) and every MISS ROLL TMT BAR — they are in neither a size nor the total.
 */
import type { Env } from '../../config/env';
import type { RmdStockReport } from '../../contracts';
import { readErpRmdStock, type RmdStockMove } from '../../integrations/erp/cache';
import { MSG } from '../../shared/messages';
import { RMD_STOCK_ITEMS } from './stock-items';

/** The items shown: a sized bar that is not a miss roll. */
const SHOWN = RMD_STOCK_ITEMS.filter((i) => i.sizeMm !== null && !/^MISS ROLL/i.test(i.name));
const ITEM = new Map(SHOWN.map((i) => [i.code, i]));
/** Below this an item is nil, not stock (the ERP's own rounding): it isn't shown. */
const MIN_MT = 0.05;
/** Summed in kg (the ERP's 3 decimals of MT) so 50.205 rounds to 50.21 as the ERP does, not 50.20. */
const kg = (mt: number) => Math.round(mt * 1000);
const mtOf = (kgs: number) => Math.round(kgs / 10) / 100;

/**
 * Every shown item, in its bar-size row (smallest first); each item's stock = Σ net movement
 * up to asOf. An item or row at 0 isn't shown.
 */
export function stockBySize(moves: RmdStockMove[], asOf: string): RmdStockReport['sizes'] {
  const byItem = new Map<string, number>(SHOWN.map((i) => [i.code, 0]));
  for (const m of moves) {
    if (!ITEM.has(m.item) || m.date > asOf) continue;
    byItem.set(m.item, byItem.get(m.item)! + kg(m.netMt));
  }
  const groups = new Map<string, { sizeMm: number | null; items: { code: string; name: string; kg: number }[] }>();
  for (const i of SHOWN) {
    const key = String(i.sizeMm);
    const g = groups.get(key) ?? { sizeMm: i.sizeMm, items: [] };
    g.items.push({ code: i.code, name: i.name, kg: byItem.get(i.code)! });
    groups.set(key, g);
  }
  return [...groups].map(([key, g]) => ({
    key,
    label: `${g.sizeMm} mm`,
    sizeMm: g.sizeMm,
    stockMt: mtOf(g.items.reduce((a, i) => a + i.kg, 0)),
    items: g.items.map((i) => ({ code: i.code, name: i.name, stockMt: mtOf(i.kg) }))
      .filter((i) => i.stockMt >= MIN_MT)
      .sort((a, b) => b.stockMt - a.stockMt || a.name.localeCompare(b.name)),
  })).filter((g) => g.stockMt >= MIN_MT)
    .sort((a, b) => (a.sizeMm ?? Infinity) - (b.sizeMm ?? Infinity));
}

export function rmdStock(env: Env, asOf: string): RmdStockReport {
  const cache = readErpRmdStock(env);
  const moves = cache?.moves ?? [];
  const sizes = stockBySize(moves, asOf);
  return {
    asOf,
    erp: {
      connection: cache ? 'up' : 'down',
      message: cache ? MSG.ERP_UP : MSG.ERP_NOT_SYNCED,
      syncedAt: cache?.syncedAt ?? null,
      lastDate: moves.at(-1)?.date ?? null,
    },
    sizes,
    totalMt: mtOf(sizes.reduce((a, s) => a + kg(s.stockMt), 0)),
  };
}
