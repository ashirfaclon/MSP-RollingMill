/** RMD production and losses from the ERP log sheet (FA-SKJ codes as the plant gave them). */
import { describe, expect, test } from 'vitest';
import { deliveryRate } from '../../src/modules/rmd/running-rate.service';
import { breakdownOf, plantEfficiency, massDifference, massYield, ofMode, summarise, rollingPct } from '../../src/modules/rmd/production.service';
import type { RmdLogRow } from '../../src/integrations/erp/cache';

const entry = (date: string, vrno: string, input: number, prod: number, prime: number, bloss: number, endcut: number, misroll: number, chip: number): RmdLogRow => ({
  date, vrno, mode: vrno.endsWith('-0002') ? 'offline' : 'online',
  v: { INPUT_MT: input, ACTUAL_RUNNING_HRS: 5, PRODUCT_PRIME_SLENGTH_MT: prod, FINISH_PRODUCT_PRIME_MT: prime, BLOSS_MT: bloss, ENDCUT_MT: endcut, MISROLL_MT: misroll, CHIP_OFF_MT: chip, TOTAL_POWER_CONSUMPTION: null, MILL_SINGLE_STAND: null,
    ROLLING_IN_TOTAL_PERCENTAGE: null, ROLLING_IN_DELIVERY_PRCNT: null, PLANT_EFFICIENCY: null, PRODUCTION_TARGET: null,
    COAL_CONSUMPTION_KGMT: null, TOTAL_COAL_CONSUMPTION: null,
    TOTAL_CCM_BD_IN_HRS: null, AVAILABLE_HOURS: null, MILL_BKDN_IN_MIN_MECHANICAL: null, MILL_BKDN_IN_MIN_ELECTRICAL: null, MILL_BKDN_IN_MIN_PROCESS: null, MILL_BKDN_IN_MIN_RM: null, MILL_BKDN_IN_MIN_POWEROTHERS: null, MILL_1_12__STAND: null,
    CCM_BYPASS_MT: null, MILL_BYPASS_MT: null, FINISH_PRODUCT_SLENGTH_MT: null, DELIVERY_RATE_MTHRS: null },
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

  test('one entry: exactly the ERP\'s figures', () => {
    expect(summarise('d', '14 Jul', ['2026-07-14'], [ON])).toMatchObject({ rollingInCastingPct: 93.01, rollingInDeliveryPct: 94.9, targetMt: 309 });
  });

  test('several entries: tonnes first — Σ input ÷ Σ (input ÷ %), as HSM / RMS and the plant\'s casting sheet (26 Nov 2026)', () => {
    // (217.24 + 100.93) ÷ (217.24 ÷ 0.93008 + 100.93 ÷ 0.94332); delivery the same with 94.903 / 94.332.
    expect(rollingPct([ON, OFF], 'ROLLING_IN_TOTAL_PERCENTAGE')).toBe(93.42);
    expect(summarise('d', '14 Jul', ['2026-07-14'], [ON, OFF])).toMatchObject({ rollingInCastingPct: 93.42, rollingInDeliveryPct: 94.72 });
    // A blank (0) % or no input: left out of both sides.
    expect(rollingPct([ON, { ...OFF, v: { ...OFF.v, ROLLING_IN_TOTAL_PERCENTAGE: 0 } }], 'ROLLING_IN_TOTAL_PERCENTAGE')).toBe(93.01);
  });

  test('entries synced before the fields were read: null, not 0', () => {
    expect(summarise('d', '7 Oct', ['2026-10-07'], ROWS)).toMatchObject({ rollingInCastingPct: null, rollingInDeliveryPct: null, targetMt: null });
  });
});

describe('breakdown, the plant\'s sheet (the user, 25 Nov 2026)', () => {
  const bd = (date: string, vrno: string, mins: Partial<Record<'MILL_BKDN_IN_MIN_PROCESS' | 'MILL_BKDN_IN_MIN_ELECTRICAL' | 'MILL_SINGLE_STAND' | 'MILL_1_12__STAND', number>>): RmdLogRow => {
    const e = entry(date, vrno, 100, 95, 95, 0, 0, 0, 0);
    return { ...e, v: { ...e.v, ...mins } };
  };
  test('all seven added, minutes to hours; each kept apart in the sheet\'s order', () => {
    // 19 Nov 2026 Online as the ERP holds it: process 85 min; plus a single-stand and a mill 1½ entry.
    const r = breakdownOf([bd('2026-11-19', 'L4P26N19-0002', { MILL_BKDN_IN_MIN_PROCESS: 85 }), bd('2026-11-04', 'L4P26N04-0002', { MILL_SINGLE_STAND: 15, MILL_1_12__STAND: 20 })]);
    expect(r.breakdownHrs).toBe(2);   // (85 + 15 + 20) ÷ 60
    expect(r.breakdown.map((b) => b.label)).toEqual(['Mechanical', 'Electrical', 'Process', 'Raw material', 'Power / other', 'Mill single stand', 'Mill 1½']);
    expect(r.breakdown.find((b) => b.label === 'Process')!.hrs).toBe(1.42);
  });
  test('a negative entry (12 Apr 2026 Offline: mill 1½ −1) is left out; no entry is null, entries without any are 0', () => {
    expect(breakdownOf([bd('2026-04-12', 'L4P26412-0002', { MILL_1_12__STAND: -1 })]).breakdownHrs).toBe(0);
    expect(breakdownOf([]).breakdownHrs).toBeNull();
  });
});

test('balance strip: CCM bypass, RMD bypass and short length summed (the user, 25 Nov 2026)', () => {
  const e = (vrno: string, ccm: number, mill: number, sl: number): RmdLogRow => {
    const x = entry('2026-11-24', vrno, 232.02, 223.3, 221.19, 0, 0, 0, 0);
    return { ...x, v: { ...x.v, CCM_BYPASS_MT: ccm, MILL_BYPASS_MT: mill, FINISH_PRODUCT_SLENGTH_MT: sl } };
  };
  // 24 Nov 2026 as the ERP holds it: Online CCM 21.20 / RMD 0 / SL 2.11; Offline 0 / 0 / 2.67.
  expect(summarise('d', '24 Nov', ['2026-11-24'], [e('L4P26N24-0002', 21.2, 0, 2.11), e('L4P26N24-0001', 0, 0, 2.67)]))
    .toMatchObject({ ccmBypassMt: 21.2, millBypassMt: 0, shortLengthMt: 4.78 });
});

test('TPH is the ERP\'s delivery rate; several entries weighted by their hours, nothing left out (the user, 25 Nov 2026)', () => {
  const e = (date: string, rate: number, hrs: number): RmdLogRow => {
    const x = entry(date, 'L4P26N0-0002', 250, 240, 238, 0, 0, 0, 0);
    return { ...x, v: { ...x.v, DELIVERY_RATE_MTHRS: rate, ACTUAL_RUNNING_HRS: hrs } };
  };
  // 6–8 Nov 2026 Online as the ERP holds them; 7 Nov is filed with 260 running hours.
  const days = [e('2026-11-06', 25.077, 9.5), e('2026-11-07', 1.133, 260), e('2026-11-08', 24.521, 9.747)];
  expect(deliveryRate(days.slice(0, 1))).toBe(25.08);   // one entry: the ERP's figure
  expect(deliveryRate([days[0], days[2]])).toBe(24.8);   // (25.077 × 9.5 + 24.521 × 9.747) ÷ 19.247
  expect(deliveryRate(days)).toBe(2.76);   // the wrong entry stays in and shows
  expect(deliveryRate([])).toBeNull();
});

describe('plant efficiency, the plant\'s formula (the user, 26 Nov 2026; availability 27 Nov 2026)', () => {
  // 19 Nov 2026 Online as the ERP holds it: Prime + SL 244.81, 9.583 h actual of 11 h available; a 250 MT plan.
  const day = (date: string, sl: number, prime: number, runH: number, availH: number | null, mode: 'online' | 'offline' = 'online'): RmdLogRow => {
    const e = entry(date, `L4P-${date}-${mode === 'online' ? '0001' : '0002'}`, 260, sl, prime, 0, 0, 0, 0);
    return { ...e, mode, v: { ...e.v, ACTUAL_RUNNING_HRS: runH, AVAILABLE_HOURS: availH, MILL_BKDN_IN_MIN_PROCESS: 85, TOTAL_CCM_BD_IN_HRS: 3 } };
  };
  const n19 = day('2026-11-19', 244.81, 240, 9.583, 11);
  const n20 = day('2026-11-20', 120, 118, 8.17, 8.17);

  test('availability = ACTUAL_RUNNING_HRS ÷ AVAILABLE_HOURS × 100; breakdown and CCM hours no longer enter it', () => {
    expect(plantEfficiency([n19], new Map([['2026-11-19', 250]]))).toEqual({
      planMt: 250, effDays: 1, effRunningHrs: 9.58, availableHrs: 11,
      performancePct: 97.92, primePerformancePct: 96, availabilityPct: 87.12,
      plantEfficiencyPct: 85.31, primeEfficiencyPct: 83.64,
    });
  });

  test('the same rule on Offline (no fixed 100 any more) and on Both', () => {
    const off = day('2026-11-19', 244.81, 240, 9.583, 11, 'offline');
    expect(plantEfficiency([off], new Map([['2026-11-19', 250]]))).toMatchObject({ availabilityPct: 87.12, plantEfficiencyPct: 85.31 });
    // Both on one day: the two entries' hours added — (9.583 + 8.17) ÷ (11 + 8.17).
    const off19 = { ...n20, date: '2026-11-19', vrno: 'L4P-2026-11-19-0002', mode: 'offline' as const };
    expect(plantEfficiency([n19, off19], new Map([['2026-11-19', 400]]))).toMatchObject({ effRunningHrs: 17.75, availableHrs: 19.17, availabilityPct: 92.61 });
  });

  test('several days: MT and hours summed first, then the formula once', () => {
    const r = plantEfficiency([n19, n20], new Map([['2026-11-19', 250], ['2026-11-20', 120]]));
    expect(r).toMatchObject({ planMt: 370, effDays: 2, performancePct: 98.6, availabilityPct: 92.61, plantEfficiencyPct: 91.31 });
  });

  test('an entry without available hours is left out of availability; none at all → no efficiency', () => {
    expect(plantEfficiency([n19, { ...n20, v: { ...n20.v, AVAILABLE_HOURS: null } }], new Map([['2026-11-19', 250], ['2026-11-20', 120]])))
      .toMatchObject({ effRunningHrs: 9.58, availableHrs: 11, availabilityPct: 87.12 });
    expect(plantEfficiency([{ ...n19, v: { ...n19.v, AVAILABLE_HOURS: null } }], new Map([['2026-11-19', 250]])))
      .toMatchObject({ availabilityPct: null, plantEfficiencyPct: null, performancePct: 97.92 });
  });

  test('only the days with both a plan and an ERP entry; no plan, no efficiency', () => {
    expect(plantEfficiency([n19, n20], new Map([['2026-11-19', 250]]))).toMatchObject({ effDays: 1, plantEfficiencyPct: 85.31 });
    expect(plantEfficiency([n19], new Map())).toMatchObject({ effDays: 0, plantEfficiencyPct: null, primeEfficiencyPct: null });
    expect(plantEfficiency([n19], undefined).plantEfficiencyPct).toBeNull();
    expect(summarise('d', '19 Nov', ['2026-11-19'], [n19], new Map([['2026-11-19', 250]]))).toMatchObject({ plantEfficiencyPct: 85.31, primeEfficiencyPct: 83.64 });
  });
});
