/** RMD production and losses from the ERP log sheet (FA-SKJ codes as the plant gave them). */
import { describe, expect, test } from 'vitest';
import { efficiencyPct, massDifference, massYield, ofMode, summarise, weightedPct } from '../../src/modules/rmd/production.service';
import type { RmdLogRow } from '../../src/integrations/erp/cache';

const entry = (date: string, vrno: string, input: number, prod: number, prime: number, bloss: number, endcut: number, misroll: number, chip: number): RmdLogRow => ({
  date, vrno, mode: vrno.endsWith('-0002') ? 'offline' : 'online',
  v: { INPUT_MT: input, ACTUAL_RUNNING_HRS: 5, PRODUCT_PRIME_SLENGTH_MT: prod, FINISH_PRODUCT_PRIME_MT: prime, BLOSS_MT: bloss, ENDCUT_MT: endcut, MISROLL_MT: misroll, CHIP_OFF_MT: chip, TOTAL_POWER_CONSUMPTION: null, MILL_SINGLE_STAND: null,
    ROLLING_IN_TOTAL_PERCENTAGE: null, ROLLING_IN_DELIVERY_PRCNT: null, PLANT_EFFICIENCY: null, PRODUCTION_TARGET: null },
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
    expect(p).toMatchObject({ entryDays: 1, productionMt: 200.12, runningHrs: 10, primeMt: 196.84, burningLossMt: 3.27, endCutMt: 4.25, missRollMt: 1.12, chipOffMt: 1, lossesMt: 9.64 });
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

  test('Online / Offline: only that rolling\'s entries; Both is every entry, and one synced before the split counts under Both only', () => {
    const on = summarise('d', '7 Oct', ['2026-10-07'], ofMode(ROWS, 'online'));
    expect(on).toMatchObject({ productionMt: 96.34, billetInputMt: 100.17, runningHrs: 5, chipOffMt: 1 });
    const off = summarise('d', '7 Oct', ['2026-10-07'], ofMode(ROWS, 'offline'));
    expect(off).toMatchObject({ productionMt: 103.78, billetInputMt: 109.59, chipOffMt: 0 });
    expect(ofMode(ROWS, 'all')).toHaveLength(3);
    const old = ROWS.map(({ mode: _m, ...r }) => r);
    expect(ofMode(old, 'online')).toHaveLength(0);
    expect(ofMode(old, 'all')).toHaveLength(3);
  });

  test('a field missing from an older cache is no entry, not NaN', () => {
    const old = ROWS.map((r) => ({ ...r, v: { ...r.v, TOTAL_POWER_CONSUMPTION: undefined as unknown as null } }));
    expect(summarise('d', '7 Oct', ['2026-10-07'], old).productionMt).toBe(200.12);
  });
});

describe('the Zoho TMT KPIs from the ERP (the plant, 21 Nov 2026)', () => {
  // 14 Jul 2026 as the ERP holds it: Online 207.78 MT of a 309 MT target; Offline 93.04 of 52.
  const zoho = (vrno: string, input: number, prod: number, target: number, casting: number, delivery: number, eff: number): RmdLogRow => {
    const e = entry('2026-07-14', vrno, input, prod, prod, 0, 0, 0, 0);
    return { ...e, v: { ...e.v, PRODUCTION_TARGET: target, ROLLING_IN_TOTAL_PERCENTAGE: casting, ROLLING_IN_DELIVERY_PRCNT: delivery, PLANT_EFFICIENCY: eff } };
  };
  const ON = zoho('L4P26J14-0001', 217.24, 207.78, 309, 93.008, 94.903, 67.243);
  const OFF = zoho('L4P26J14-0002', 100.93, 93.04, 52, 94.332, 94.332, 178.923);

  test('one entry: exactly the ERP\'s figures; efficiency = production ÷ target', () => {
    expect(summarise('d', '14 Jul', ['2026-07-14'], [ON])).toMatchObject({ rollingInCastingPct: 93.01, rollingInDeliveryPct: 94.9, plantEfficiencyPct: 67.24, targetMt: 309 });
  });

  test('several entries: the percentages weighted by billet input; efficiency Σ production ÷ Σ target', () => {
    expect(weightedPct([ON, OFF], 'ROLLING_IN_TOTAL_PERCENTAGE')).toBe(93.43);
    expect(efficiencyPct([ON, OFF])).toBe(83.33);
  });

  test('entries synced before the fields were read: null, not 0', () => {
    expect(summarise('d', '7 Oct', ['2026-10-07'], ROWS)).toMatchObject({ rollingInCastingPct: null, rollingInDeliveryPct: null, plantEfficiencyPct: null, targetMt: null });
  });
});
