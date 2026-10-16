/** LSM / RMS running hours from the Production Sheet: each run's clock times on its Date's mill day, overlaps merged. */
import { describe, expect, test } from 'vitest';
import type { InsightEntry } from '../../src/integrations/logbook/client';
import { ratePeriod, runHoursByDay } from '../../src/modules/lsm/running-rate.service';

const run = (date: string, start: string, end: string, remarks = ''): InsightEntry => ({
  result: { date, 'start-time': `2026-10-16T${start}:00`, 'end-time': `2026-10-16T${end}:00`, remarks },
});
const LSM_DAY = 9 * 60;

describe('running hours from the Production Sheet', () => {
  test('the clock time only (the form stamps the filling day); a run past midnight still counts its length', () => {
    const h = runHoursByDay([run('2026-10-14', '10:10', '11:00'), run('2026-10-14', '23:00', '00:00'), run('2026-10-14', '00:00', '00:40')], LSM_DAY);
    expect(h.get('2026-10-14')).toBe(2.5);   // 50 + 60 + 40 min
  });

  test('runs entered twice, or overlapping, count once', () => {
    const h = runHoursByDay([run('2026-10-07', '06:20', '09:20'), run('2026-10-07', '07:20', '09:30'), run('2026-10-07', '09:21', '22:20')], 9 * 60 + 30);
    // 06:20–09:20 and 07:20–09:30 overlap, and 09:21–22:20 joins on: one run, 06:20–22:20 = 16 h.
    expect(h.get('2026-10-07')).toBe(16);
  });

  test('an entry without both times, or a test entry, is left out', () => {
    const h = runHoursByDay([{ result: { date: '2026-10-14', 'start-time': '2026-10-16T10:00:00' } }, run('2026-10-14', '10:00', '11:00', 'Test entry')], LSM_DAY);
    expect(h.has('2026-10-14')).toBe(false);
  });

  test('rate = production ÷ hours over the days with both', () => {
    const p = ratePeriod('t', 'Total', ['2026-10-13', '2026-10-14', '2026-10-15'],
      new Map([['2026-10-13', 410.59], ['2026-10-14', 386.13], ['2026-10-15', null]]), new Map([['2026-10-13', 15.58], ['2026-10-15', 7.52]]));
    expect(p).toMatchObject({ productionMt: 796.72, runH: 23.1, rateTph: 26.35 });   // 410.59 ÷ 15.58
  });
});
