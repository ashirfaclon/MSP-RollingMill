/** RMD plan: the FY 2026-27 month-wise plan (Prime + SL) spread to days and halved per shift. */
import { describe, expect, test } from 'vitest';
import { planMtOn, rmdPlanDays, summarisePlan } from '../../src/modules/rmd/plan.service';

const MONTHS = new Map([
  ['2026-09', { month: '2026-09', workingDays: 30, calendarDays: 30, planMt: 9349.05 }],
  ['2026-10', { month: '2026-10', workingDays: 29, calendarDays: 31, planMt: 8220.638 }],
]);

describe('RMD plan per day', () => {
  test('a month with every day working: month ÷ working days', () => {
    expect(planMtOn('2026-09-15', MONTHS, [])).toBeCloseTo(311.635, 3);
  });

  test('shutdown dates unknown: spread over the calendar days, so the month adds up', () => {
    expect(planMtOn('2026-10-01', MONTHS, [])).toBeCloseTo(8220.638 / 31, 6);
  });

  test('shutdown dates known: 0 on them, month ÷ working days on the rest', () => {
    const off = ['2026-10-20', '2026-10-21'];
    expect(planMtOn('2026-10-20', MONTHS, off)).toBe(0);
    expect(planMtOn('2026-10-01', MONTHS, off)).toBeCloseTo(8220.638 / 29, 6);
    // Only one of two dates given: not enough to know — still the calendar spread.
    expect(planMtOn('2026-10-01', MONTHS, ['2026-10-20'])).toBeCloseTo(8220.638 / 31, 6);
  });

  test('no month in the plan → null', () => {
    expect(planMtOn('2027-04-01', MONTHS, [])).toBeNull();
  });

  test('the real plan: Oct 2026 = 8,220.638 ÷ 31 = 265.18 a day, 132.59 a shift', () => {
    const [d] = rmdPlanDays(['2026-10-07'], new Map([['2026-10-07', 200.12]]));
    expect(d).toEqual({ date: '2026-10-07', planMt: 265.18, byShift: { Day: 132.59, Night: 132.59 }, actualMt: 200.12 });
  });
});

describe('RMD plan totals', () => {
  test('gap and compliance only over the days with both plan and ERP production', () => {
    const days = rmdPlanDays(['2026-10-07', '2026-10-08', '2026-10-12'], new Map([['2026-10-07', 200.12], ['2026-10-08', 214.79]]));
    const t = summarisePlan(days);
    expect(t).toMatchObject({ plannedDays: 3, comparedDays: 2, planMt: 795.54, comparedPlanMt: 530.36, actualMt: 414.91, gapMt: -115.45 });
    expect(t.compliancePct).toBe(78.23);
    expect(t.byShift).toEqual({ Day: 397.77, Night: 397.77 });
  });
});
