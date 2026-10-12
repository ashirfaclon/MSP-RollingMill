/** RMD production and losses from the ERP log sheet (FA-SKJ codes as the plant gave them). */
import { describe, expect, test } from 'vitest';
import { massDifference, massYield, summarise } from '../../src/modules/rmd/production.service';

const entry = (date: string, vrno: string, input: number, prod: number, prime: number, bloss: number, endcut: number, misroll: number, chip: number) => ({
  date, vrno, v: { INPUT_MT: input, PRODUCT_PRIME_SLENGTH_MT: prod, FINISH_PRODUCT_PRIME_MT: prime, BLOSS_MT: bloss, ENDCUT_MT: endcut, MISROLL_MT: misroll, CHIP_OFF_MT: chip },
});
// 7 Oct 2026 as the ERP holds it: two entries.
const ROWS = [
  entry('2026-10-07', 'L4P26O07-0001', 100.17, 96.34, 95.41, 0.75, 1.8, 0.28, 1),
  entry('2026-10-07', 'L4P26O07-0002', 109.59, 103.78, 101.43, 2.52, 2.45, 0.84, 0),
  entry('2026-10-08', 'L4P26O08-0001', 225.88, 214.79, 211.02, 3.8, 4.65, 2.14, 0.5),
];

describe('RMD production from the log sheet', () => {
  test('a date is the sum of its entries — both production declarations and each loss', () => {
    const p = summarise('d', '7 Oct', ['2026-10-07'], ROWS);
    expect(p).toMatchObject({ entryDays: 1, productionMt: 200.12, primeMt: 196.84, burningLossMt: 3.27, endCutMt: 4.25, missRollMt: 1.12, chipOffMt: 1, lossesMt: 9.64 });
  });

  test('a date with no entry is null, not 0', () => {
    const p = summarise('d', '6 Oct', ['2026-10-06'], ROWS);
    expect(p).toMatchObject({ entryDays: 0, productionMt: null, primeMt: null, lossesMt: null });
  });

  test('mass yield and mass difference from INPUT_MT: input − production is the four losses', () => {
    const d = summarise('d', '7 Oct', ['2026-10-07'], ROWS);
    expect(d).toMatchObject({ billetInputMt: 209.76, productionMt: 200.12, massDiffMt: 9.64, lossesMt: 9.64, massYieldPct: 95.4 });
    const p = summarise('w', 'Week', ['2026-10-07', '2026-10-08'], ROWS);
    expect(p).toMatchObject({ productionMt: 414.91, primeMt: 407.86, billetInputMt: 435.64, massDiffMt: 20.73, massYieldPct: 95.24 });
    expect(summarise('d', '6 Oct', ['2026-10-06'], ROWS)).toMatchObject({ billetInputMt: null, massYieldPct: null, massDiffMt: null });
    expect(massYield(200.12, 209.76)).toBe(95.4);
    expect(massDifference(209.76, 200.12)).toBe(9.64);
    expect(massYield(200.12, 0)).toBeNull();
  });
});
