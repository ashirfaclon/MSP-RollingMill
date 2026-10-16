/** RMD finished stock by size: the ERP item ledger netted to a date; no unsized items, no miss roll. */
import { describe, expect, test } from 'vitest';
import { stockBySize } from '../../src/modules/rmd/stock.service';
import { RMD_STOCK_ITEMS } from '../../src/modules/rmd/stock-items';

// 8 mm: MS PREMIUM TMT BARS 8 MM (F01140200014), MS TMT BAR 8 MM SL (F01140300053);
// 12 mm: MS PREMIUM TMT BARS 12 MM (F01140200009); MS RINGS 6 X 9 (F01140100004) has no size;
// MISS ROLL TMT BAR 8 MM (F01140200007).
const MOVES = [
  { date: '2023-03-31', item: 'F01140200014', netMt: 10 },
  { date: '2026-10-07', item: 'F01140200014', netMt: 5.5 },
  { date: '2026-10-08', item: 'F01140300053', netMt: 2.25 },
  { date: '2026-10-08', item: 'F01140200009', netMt: 4 },
  { date: '2026-10-09', item: 'F01140200009', netMt: -4 },
  { date: '2026-10-08', item: 'F01140100004', netMt: 13 },
  { date: '2026-10-08', item: 'F01140200007', netMt: 7 },
  { date: '2026-10-08', item: 'F99999999999', netMt: 99 },   // not on the plant's list: never counted
];

describe('RMD stock by size', () => {
  test('every sized, non-miss-roll SKU of the plant list is in exactly one row, 8 → 32 mm; no Other, no miss roll', () => {
    const all = RMD_STOCK_ITEMS.map((i) => ({ date: '2026-10-01', item: i.code, netMt: 1 }));
    const s = stockBySize(all, '2026-10-08');
    expect(s.map((x) => x.label)).toEqual(['8 mm', '10 mm', '12 mm', '16 mm', '20 mm', '25 mm', '32 mm']);
    const names = s.flatMap((x) => x.items.map((i) => i.name));
    const shown = RMD_STOCK_ITEMS.filter((i) => i.sizeMm !== null && !i.name.startsWith('MISS ROLL'));
    expect(new Set(names)).toEqual(new Set(shown.map((i) => i.name)));
    expect(names.filter((n) => n.startsWith('MISS ROLL'))).toEqual([]);
  });

  test('stock at the end of a date: movements up to it, a size = Σ its SKUs, largest first; 0 not shown', () => {
    const s = stockBySize(MOVES, '2026-10-08');
    expect(s.map((x) => x.key)).toEqual(['8', '12']);   // rings (no size) and the 8 mm miss roll left out
    expect(s[0]).toEqual({ key: '8', label: '8 mm', sizeMm: 8, stockMt: 17.75, items: [
      { code: 'F01140200014', name: 'MS PREMIUM TMT BARS 8 MM', stockMt: 15.5 },
      { code: 'F01140300053', name: 'MS TMT BAR 8 MM SL', stockMt: 2.25 },
    ] });
    // 9 Oct: 12 mm sold out — no row.
    expect(stockBySize(MOVES, '2026-10-09').map((x) => x.key)).toEqual(['8']);
    expect(stockBySize(MOVES, '2026-10-06')).toEqual([
      { key: '8', label: '8 mm', sizeMm: 8, stockMt: 10, items: [{ code: 'F01140200014', name: 'MS PREMIUM TMT BARS 8 MM', stockMt: 10 }] },
    ]);
  });
});
