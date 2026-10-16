/** LSM plan: October 2026, 8,750 MT over 31 days, halved per shift — against ERP PRODUTION_MT. */
import { describe, expect, test } from 'vitest';
import type { Env } from '../../src/config/env';
import { lsmPlan, primeByShift, shiftTotals, splitByShift } from '../../src/modules/lsm/plan.service';
import type { InsightEntry } from '../../src/integrations/logbook/client';

// No ERP cache and no logbook session: the plan alone.
const env = { erpCacheDir: 'data-test-none', iosenseBearer: null, logbookInsightId: null } as unknown as Env;

describe('LSM plan', () => {
  test('a day = 8,750 ÷ 31 = 282.26 MT, 141.13 a shift; the month adds up to 8,750', async () => {
    const r = await lsmPlan(env, '2026-10-01', '2026-10-31');
    expect(r.days[0]).toMatchObject({ date: '2026-10-01', planMt: 282.26, byShift: { Day: 141.13, Night: 141.13 } });
    expect(r.totals.planMt).toBeCloseTo(8750, 0);
    expect(r.totals.plannedDays).toBe(31);
  });

  test('no plan outside October; no ERP production: no gap, no compliance', async () => {
    const r = await lsmPlan(env, '2026-09-30', '2026-11-01');
    expect(r.days.map((d) => d.planMt)).toEqual([null, ...Array(31).fill(282.26), null]);
    expect(r.totals).toMatchObject({ comparedDays: 0, actualMt: null, gapMt: null, compliancePct: null });
  });
});

const entry = (date: string, shift: string, prime: number | null, remarks = ''): InsightEntry => ({
  tags: ['lsm-production-sheet/production-sheet'], result: { date, shift, prime, remarks },
});

describe('LSM output per shift: the ERP day split by the shifts\' prime pieces', () => {
  test('prime pieces per date and shift; no shift, no pieces or a test entry counts in neither', () => {
    const p = primeByShift([
      entry('2026-10-14', 'DAY', 70), entry('2026-10-14', 'day', 30), entry('2026-10-14', 'NIGHT', 100),
      entry('2026-10-14', '', 50), entry('2026-10-14', 'NIGHT', null), entry('2026-10-14', 'DAY', 9, 'Test entry'),
    ]);
    expect(p.get('2026-10-14')).toEqual({ Day: 100, Night: 100 });
  });

  test('Day + Night = the ERP figure; null for both without ERP or without pieces', () => {
    const day = { date: '2026-10-14', planMt: 282.26, byShift: { Day: 141.13, Night: 141.13 }, actualMt: 386.13 };
    expect(splitByShift(day, { Day: 781, Night: 430 })).toEqual({ Day: 249.02, Night: 137.11 });
    expect(splitByShift(day, { Day: 625 })).toEqual({ Day: 386.13, Night: 0 });
    expect(splitByShift(day, undefined)).toEqual({ Day: null, Night: null });
    expect(splitByShift({ ...day, actualMt: null }, { Day: 1, Night: 1 })).toEqual({ Day: null, Night: null });
  });

  test('shift compliance over the days with a split only', () => {
    const t = shiftTotals([
      { date: '2026-10-13', planMt: 282.26, byShift: { Day: 141.13, Night: 141.13 }, actualMt: 300, actualByShift: { Day: 100, Night: 200 } },
      { date: '2026-10-14', planMt: 282.26, byShift: { Day: 141.13, Night: 141.13 }, actualMt: null, actualByShift: { Day: null, Night: null } },
    ]);
    expect(t.Day).toEqual({ actualMt: 100, comparedPlanMt: 141.13, compliancePct: 70.86 });
    expect(t.Night).toEqual({ actualMt: 200, comparedPlanMt: 141.13, compliancePct: 141.71 });
  });

  test('no plan (RMS): output per shift without a target or compliance', () => {
    const t = shiftTotals([
      { date: '2026-10-13', planMt: null, byShift: {}, actualMt: 300, actualByShift: { Day: 100, Night: 200 } },
    ]);
    expect(t.Day).toEqual({ actualMt: 100, comparedPlanMt: null, compliancePct: null });
  });
});
