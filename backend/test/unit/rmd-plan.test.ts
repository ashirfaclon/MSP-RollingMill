/** Plans come only from the logbook Production Plan form (the user, 31 Oct 2026). */
import { describe, expect, test } from 'vitest';
import { planDaysFrom, summarisePlan } from '../../src/modules/rmd/plan.service';
import type { SavedPlanDay } from '../../src/modules/forms-db/plan.store';

const saved = (rows: [string, number, number][]) => new Map<string, SavedPlanDay>(rows.map(([date, dayMt, nightMt]) =>
  [date, { date, dayOff: false, nightOff: false, dayMt, nightMt, monthPlanMt: null, at: '' }]));

describe('plan per day, from the logbook', () => {
  test('a saved date: Day + Night, per shift as saved; a date with no entry has no plan', () => {
    const days = planDaysFrom(['2026-10-07', '2026-10-08'], new Map([['2026-10-07', 200.12]]), saved([['2026-10-07', 132.6, 132.58]]));
    expect(days[0]).toEqual({ date: '2026-10-07', planMt: 265.18, byShift: { Day: 132.6, Night: 132.58 }, actualMt: 200.12 });
    expect(days[1]).toEqual({ date: '2026-10-08', planMt: null, byShift: {}, actualMt: null });
  });
});

describe('plan totals', () => {
  test('gap and compliance only over the days with both plan and ERP production', () => {
    const days = planDaysFrom(['2026-10-07', '2026-10-08', '2026-10-12'], new Map([['2026-10-07', 200.12], ['2026-10-08', 214.79]]),
      saved([['2026-10-07', 132.59, 132.59], ['2026-10-08', 132.59, 132.59], ['2026-10-12', 132.59, 132.59]]));
    const t = summarisePlan(days);
    expect(t).toMatchObject({ plannedDays: 3, comparedDays: 2, planMt: 795.54, comparedPlanMt: 530.36, actualMt: 414.91, gapMt: -115.45 });
    expect(t.compliancePct).toBe(78.23);
    expect(t.byShift).toEqual({ Day: 397.77, Night: 397.77 });
  });
  test('no plan saved: no plan, the output is the ERP over the days entered', () => {
    const t = summarisePlan(planDaysFrom(['2026-11-01', '2026-11-02'], new Map([['2026-11-01', 250]]), saved([])));
    expect(t).toMatchObject({ planMt: null, plannedDays: 0, actualMt: 250, gapMt: null, compliancePct: null });
  });
});
