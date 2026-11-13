import { describe, expect, test } from 'vitest';
import { planEntries, planOfDate, rollingOf, shutdownOf, shutdownValue, type SavedPlanDay } from '../../src/modules/forms-db/plan.store';

/** A month of days at 100 / 100, with the given shutdowns. */
const month = (off: Record<string, { dayOff?: boolean; nightOff?: boolean }> = {}) =>
  Array.from({ length: 30 }, (_, i) => {
    const date = `2026-11-${String(i + 1).padStart(2, '0')}`;
    return { date, dayOff: !!off[date]?.dayOff, nightOff: !!off[date]?.nightOff, dayMt: 100, nightMt: 100 };
  });

describe('Production plan: a shutdown can be one shift or the whole day', () => {
  test('the Shutdown field: No, Day shift, Night shift, Yes (whole day)', () => {
    expect(shutdownValue(false, false)).toBe('No');
    expect(shutdownValue(true, false)).toBe('Day shift');
    expect(shutdownValue(false, true)).toBe('Night shift');
    expect(shutdownValue(true, true)).toBe('Yes');
  });
  test('read back — entries saved before keep Yes / No', () => {
    expect(shutdownOf('Yes')).toEqual({ dayOff: true, nightOff: true });
    expect(shutdownOf('No')).toEqual({ dayOff: false, nightOff: false });
    expect(shutdownOf('Night shift')).toEqual({ dayOff: false, nightOff: true });
    expect(shutdownOf('Day shift')).toEqual({ dayOff: true, nightOff: false });
    expect(shutdownOf(undefined)).toEqual({ dayOff: false, nightOff: false });
  });
  test('a shift off has no target; working days count half a day for it', () => {
    const rows = planEntries({
      month: '2026-11', monthPlanMt: 5700,
      days: month({ '2026-11-02': { nightOff: true }, '2026-11-03': { dayOff: true, nightOff: true }, '2026-11-04': { dayOff: true } }),
    });
    const on = (d: string) => rows.find((r) => r.date === d)!;
    expect(on('2026-11-02')).toMatchObject({ shutdown: 'Night shift', 'day-mt': 100, 'night-mt': 0, 'day-total-mt': 100 });
    expect(on('2026-11-03')).toMatchObject({ shutdown: 'Yes', 'day-mt': 0, 'night-mt': 0 });
    expect(on('2026-11-04')).toMatchObject({ shutdown: 'Day shift', 'day-mt': 0, 'night-mt': 100 });
    expect(on('2026-11-01')).toMatchObject({ shutdown: 'No', 'day-total-mt': 200 });
    expect(rows[0]['working-days']).toBe(28);   // 30 − 1 whole day − ½ − ½
    expect(rows[0]['month-total-mt']).toBe(5600);
  });
});

describe('RMD plan: Online and Offline (the user, 13 Nov 2026)', () => {
  const d = (dayMt: number, nightMt: number, at: string, nightOff = false): SavedPlanDay =>
    ({ date: '2026-11-20', dayOff: false, nightOff, dayMt, nightMt, monthPlanMt: (dayMt + nightMt) * 30, at });
  test('each entry carries its Rolling', () => {
    const rows = planEntries({ month: '2026-11', monthPlanMt: 6000, days: month(), rolling: 'offline' });
    expect(rows[0].rolling).toBe('Offline');
    expect(planEntries({ month: '2026-11', monthPlanMt: 6000, days: month() })[0]).not.toHaveProperty('rolling');
    expect(rollingOf('Online')).toBe('online');
    expect(rollingOf(undefined)).toBeNull();
  });
  test('Online / Offline: that rolling only; Both: the two added', () => {
    const m = new Map([['online', d(120, 130, '2026-11-02')], ['offline', d(30, 0, '2026-11-05', true)], ['', d(200, 200, '2026-10-30')]]);
    expect(planOfDate(m, 'online')?.dayMt).toBe(120);
    expect(planOfDate(m, 'offline')?.nightOff).toBe(true);
    expect(planOfDate(m, 'all')).toMatchObject({ dayMt: 150, nightMt: 130, nightOff: false, monthPlanMt: 8400, at: '2026-11-05' });
  });
  test('Both: one rolling alone counts as is; the whole-mill entry only without either', () => {
    expect(planOfDate(new Map([['online', d(120, 130, 'a')], ['', d(200, 200, 'b')]]), 'all')?.dayMt).toBe(120);
    expect(planOfDate(new Map([['', d(200, 200, 'b')]]), 'all')?.dayMt).toBe(200);
    expect(planOfDate(new Map([['', d(200, 200, 'b')]]), 'online')).toBeUndefined();
  });
});
