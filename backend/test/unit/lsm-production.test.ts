/** LSM production and losses from the ERP log sheet (FA-LP-P codes as the plant gave them). */
import { describe, expect, test } from 'vitest';
import { summariseLsm } from '../../src/modules/lsm/production.service';

const entry = (date: string, vrno: string, prod: number, bloss: number, endcut: number, misroll: number, cold: number, reject: number) => ({
  date, vrno, v: {
    INPUT_MT: 285.44, INPUT_PCS: 1313, PRODUTION_MT: prod, SHORTLENGTH_MT: 2, B_LOSS_MT: bloss, ENDCUT_MT: endcut, MISROLL_MT: misroll, COLD_MT: cold, REJECT_MT: reject,
    LSM_BY_PASS_MT: 1, CCM_BY_PASS_MT: 2, END_CRACK_BY_PASS_CCM_MT: 0, NET_RUNNING_HRS: 11.52,
    // The management KPIs of 11 Oct 2026 as the ERP holds them.
    DELAY_HRS: 0.31, PLANT_AVAILABILITY: 97.38, PLANT_PERFORMANCE: 94.037, PLANT_EFFICIENCY: 91.573,
    ROLLING_PERCENTAGE_CASTING: 91.099, ROLLING_PERCENTAGE_DELIVERY: 91.997, TOTAL_PRODUCTION: 271.79,
  },
});
// 11 Oct 2026 as the ERP holds it (L7P26O11-0001).
const ROWS = [entry('2026-10-11', 'L7P26O11-0001', 269.79, 3.18, 8.75, 1.51, 0, 0.21)];

describe('LSM production from the log sheet', () => {
  test('a date: production (PRODUTION_MT), each loss and their sum', () => {
    expect(summariseLsm('d', '11 Oct', ['2026-10-11'], ROWS)).toMatchObject({
      entryDays: 1, productionMt: 269.79, burningLossMt: 3.18, endCutMt: 8.75, missRollMt: 1.51, coldMt: 0, rejectMt: 0.21,
      shortLengthMt: 2, lossesMt: 15.65, lsmBypassMt: 1, ccmBypassMt: 2, endCrackBypassMt: 0,
      // INPUT_MT 285.44: mass difference 15.65 = the six losses; yield 269.79 ÷ 285.44 = 94.52 %.
      billetsPcs: 1313, billetInputMt: 285.44, massDiffMt: 15.65, massYieldPct: 94.52,
    });
  });
  test('a date: the ERP\'s own management KPIs; yield with non-prime adds short length', () => {
    expect(summariseLsm('d', '11 Oct', ['2026-10-11'], ROWS)).toMatchObject({
      availabilityPct: 97.38, performancePct: 94.04, efficiencyPct: 91.57, rollingInCastingPct: 91.1, rollingInDeliveryPct: 92,
      // TOTAL_PRODUCTION 271.79 ÷ INPUT_MT 285.44.
      totalProductionMt: 271.79, nonPrimeYieldPct: 95.22, delayHrs: 0.31,
    });
  });
  test('several dates: each KPI weighted by the hours or tonnes it is a share of', () => {
    // 16 Nov 2026 as the ERP holds it: run 15.25 h, delay 2 h.
    const nov16 = { date: '2026-11-16', vrno: 'L7P26N16-0001', v: {
      ...ROWS[0].v, INPUT_MT: 446.88, PRODUTION_MT: 424.83, NET_RUNNING_HRS: 15.25, DELAY_HRS: 2,
      PLANT_AVAILABILITY: 88.406, PLANT_PERFORMANCE: 96.585, PLANT_EFFICIENCY: 85.387,
      ROLLING_PERCENTAGE_CASTING: 97.589, ROLLING_PERCENTAGE_DELIVERY: 86.005, TOTAL_PRODUCTION: 426.33,
    } };
    const two = summariseLsm('p', 'Two days', ['2026-10-11', '2026-11-16'], [...ROWS, nov16]);
    expect(two).toMatchObject({
      // availability = Σ run ÷ Σ (run + delay) = 26.77 ÷ 29.08; performance by run hours.
      availabilityPct: 92.06, performancePct: 95.49,
      // efficiency = availability × performance over the two days, as on one.
      efficiencyPct: 87.9,
      // rolling %: tonnes first — Σ input ÷ Σ (input ÷ %) (26 Nov 2026).
      rollingInCastingPct: 94.95, rollingInDeliveryPct: 88.25, nonPrimeYieldPct: 95.33,
    });
  });
  test('a cache synced before the KPIs were added reads them as not entered', () => {
    const { DELAY_HRS, PLANT_AVAILABILITY, PLANT_PERFORMANCE, PLANT_EFFICIENCY, ROLLING_PERCENTAGE_CASTING, ROLLING_PERCENTAGE_DELIVERY, TOTAL_PRODUCTION, ...old } = ROWS[0].v;
    const r = summariseLsm('d', '11 Oct', ['2026-10-11'], [{ ...ROWS[0], v: old as typeof ROWS[0]['v'] }]);
    expect(r).toMatchObject({ productionMt: 269.79, availabilityPct: null, efficiencyPct: null, nonPrimeYieldPct: null, delayHrs: null });
  });
  test('the section(s) rolled: finished receipts by section, named as Finished stock by size; defective left out', () => {
    // 11 Nov 2026 as the ERP holds it.
    const receipts = [
      { date: '2026-11-11', item: 'F01011500003', name: 'MS ANGLE 65X6 6 mtr', mt: 195.38 },
      { date: '2026-11-11', item: 'F01011600002', name: 'MS ANGLE 65X8 6 mtr', mt: 106.77 },
      { date: '2026-11-11', item: 'F01070100011', name: 'MS ANGLE 65X6  DEFECTIVE', mt: 1.9 },
      { date: '2026-11-12', item: 'F01011300004', name: 'MS ANGLE 50 X 6 6 mtr', mt: 297.08 },
    ];
    expect(summariseLsm('d', '11 Nov', ['2026-11-11'], ROWS, receipts).sections)
      .toEqual([{ label: 'A 65×65×6', mt: 195.38 }, { label: 'A 65×65×8', mt: 106.77 }]);
    expect(summariseLsm('d', '10 Oct', ['2026-10-10'], ROWS, receipts).sections).toEqual([]);
  });
  test('a date with no entry is null, not 0', () => {
    expect(summariseLsm('d', '10 Oct', ['2026-10-10'], ROWS)).toMatchObject({ entryDays: 0, productionMt: null, lossesMt: null });
  });
});
