/** RMD finished stock by size: every F0114 item, the ERP item ledger netted to a date; no unsized items, no miss roll. */
import { describe, expect, test } from 'vitest';
import { barSizeOf, stockBySize } from '../../src/modules/rmd/stock.service';

const ITEMS = [
  { code: 'F01140200014', name: 'MS PREMIUM TMT BARS 8 MM' },
  { code: 'F01140300053', name: 'MS TMT BAR 8 MM SL' },
  { code: 'F01140200009', name: 'MS PREMIUM TMT BARS 12 MM' },
  { code: 'F01140300080', name: 'MS TMT BAR 32 MM (550 D) SP. LENGTH' },
  { code: 'F01140100004', name: 'MS RINGS 6 X 9' },
  { code: 'F01140200007', name: 'MISS ROLL TMT BAR 8 MM' },
  { code: 'F01140300002', name: 'MS ROUND BAR 25 MM' },
  { code: 'F01140300055', name: 'TMT BAR' },
];
const MOVES = [
  { date: '2023-03-31', item: 'F01140200014', netMt: 10 },
  { date: '2026-10-07', item: 'F01140200014', netMt: 5.5 },
  { date: '2026-10-08', item: 'F01140300053', netMt: 2.25 },
  { date: '2026-10-08', item: 'F01140200009', netMt: 4 },
  { date: '2026-10-09', item: 'F01140200009', netMt: -4 },
  { date: '2026-10-08', item: 'F01140100004', netMt: 13 },
  { date: '2026-10-08', item: 'F01140200007', netMt: 7 },
  { date: '2026-10-08', item: 'F01140300002', netMt: 3 },
  { date: '2026-10-08', item: 'F01140300055', netMt: 1 },
  { date: '2026-10-08', item: 'F01140300080', netMt: 21.05 },
  { date: '2026-10-08', item: 'F99999999999', netMt: 99 },   // not an RMD item: never counted
];

describe('bar size from the name', () => {
  test.each([
    ['MS TMT BAR 12 MM SL', 12], ['CRS TMT BAR 20 MM', 20], ['MS TMT BAR 32 MM (550 D) SP. LENGTH', 32],
    ['TMT BAR', null], ['MS RINGS 7 X 7', null], ['MS ROUND BAR 25 MM', null],
  ])('%s → %s', (name, size) => expect(barSizeOf(name)).toBe(size));
});

describe('RMD stock by size', () => {
  test('stock at the end of a date: a size = Σ its items, smallest first; no rings, round bar, unsized or miss roll; 0 not shown', () => {
    const s = stockBySize(MOVES, '2026-10-08', ITEMS);
    expect(s.map((x) => x.key)).toEqual(['8', '12', '32']);
    expect(s[0]).toEqual({ key: '8', label: '8 mm', sizeMm: 8, stockMt: 17.75, items: [
      { code: 'F01140200014', name: 'MS PREMIUM TMT BARS 8 MM', stockMt: 15.5 },
      { code: 'F01140300053', name: 'MS TMT BAR 8 MM SL', stockMt: 2.25 },
    ] });
    expect(s[2].stockMt).toBe(21.05);   // 32 mm 550 D special length — not on the old list, now counted
    expect(stockBySize(MOVES, '2026-10-09', ITEMS).map((x) => x.key)).toEqual(['8', '32']);   // 12 mm sold out
    expect(stockBySize(MOVES, '2026-10-06', ITEMS)).toEqual([
      { key: '8', label: '8 mm', sizeMm: 8, stockMt: 10, items: [{ code: 'F01140200014', name: 'MS PREMIUM TMT BARS 8 MM', stockMt: 10 }] },
    ]);
  });
});
