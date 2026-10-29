/** Condition Analytics costing: the HSM KPI sheet's formulas, month by month, then the period. */
import { describe, expect, test } from 'vitest';
import { caKpis, caPeriod } from '../../src/modules/ca/ca.service';
import type { CaActual, CaInputs } from '../../src/contracts';

const inputs: CaInputs = {
  benchmarkRateTph: 30, benchmarkKwhPerMt: 100, standardYieldPct: 96, tariffActual: 6, tariffStandard: 5,
  otherConversionActualRs: 310_000, otherConversionStandard: 500, netMaterialPerMt: 40_000, contributionPerMt: 1_200,
};
// 2,500 MT in 100 h (25 TPH); 275,000 kWh (110 kWh/MT); 2,600 MT billets at 95 % yield.
const actual: CaActual = { mt: 2_500, runH: 100, rateTph: 25, kwh: 275_000, kwhPerMt: 110, billetInputMt: 2_600, yieldPct: 95 };

describe('CA KPIs', () => {
  test('one month, 10 of its 31 days', () => {
    const k = caKpis(inputs, actual, 10 / 31);
    expect(k.opportunityMt).toBe(500);                     // (30 − 25) × 100 h
    expect(k.conversionRs).toBeCloseTo(1_650_000 + 100_000); // 110 kWh/MT × ₹6 × 2,500 MT + ₹310,000 × 10/31
    expect(k.conversionPerMt).toBeCloseTo(700);
    expect(k.standardPerMt).toBe(1_000);                    // 100 × ₹5 + ₹500
    expect(k.variancePerMt).toBeCloseTo(-300);
    expect(k.variance!.tariffRs).toBe(275_000);             // 275,000 kWh × ₹1
    expect(k.variance!.energyRs).toBe(125_000);             // (275,000 − 250,000) × ₹5
    expect(k.variance!.otherRs).toBeCloseTo(100_000 - 1_250_000);
    expect(k.variance!.totalRs).toBeCloseTo(-300 * 2_500);  // the three add up to the ₹/MT variance × MT
    expect(k.yieldLossRs).toBeCloseTo(0.01 * 2_600 * 40_000);
    expect(k.marginRs).toBe(600_000);
  });

  test('no inputs: every figure NA; faster than the benchmark: no opportunity', () => {
    expect(caKpis(null, actual, 1).conversionPerMt).toBeNull();
    expect(caKpis(inputs, { ...actual, rateTph: 32 }, 1).opportunityMt).toBe(0);
    expect(caKpis(inputs, { ...actual, kwhPerMt: null }, 1)).toMatchObject({ conversionPerMt: null, variance: null, opportunityMt: 500 });
  });

  test('two months: ₹ and MT added up; a month without inputs leaves the period NA', () => {
    const part = (month: string, i: CaInputs | null) => ({ month, from: `${month}-01`, to: `${month}-10`, share: 10 / 31, inputs: i, actual, kpis: caKpis(i, actual, 10 / 31) });
    const r = caPeriod('rmd', '2026-09-01', '2026-10-10', [part('2026-09', inputs), part('2026-10', inputs)]);
    expect(r.missing).toEqual([]);
    expect(r.actual).toMatchObject({ mt: 5_000, runH: 200, rateTph: 25, kwhPerMt: 110, yieldPct: 95 });
    expect(r.kpis.opportunityMt).toBe(1_000);
    expect(r.kpis.conversionPerMt).toBeCloseTo(700);
    expect(r.kpis.standardPerMt).toBeCloseTo(1_000);
    const gap = caPeriod('rmd', '2026-09-01', '2026-10-10', [part('2026-09', inputs), part('2026-10', null)]);
    expect(gap.missing).toEqual(['2026-10']);
    expect(gap.kpis.conversionPerMt).toBeNull();
    expect(gap.inputs).toBeNull();
  });
});
