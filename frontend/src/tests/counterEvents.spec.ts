/**
 * The production counter as reset events — real 25 Sep and 22 Sep readings, no plant access.
 * Day end − day start would give −55.86 t for 25 Sep; the events give 119.81 t.
 */
import { test, expect } from '@playwright/test';
import { counterEvents, eventIncrements } from '@/server/hsm/counterEvents';
import { buildDays } from '@/server/hsm/production';

const at = (s: string) => Date.parse(`${s}+05:30`);
const boundary = (pairs: [string, number][]) => new Map(pairs.map(([d, v]) => [at(`${d}T06:00:00`), v]));

test('25 Sep: three events, each counter-before-reset minus its start, total 119.81 t', () => {
  const c = {
    first: { t: at('2026-09-21T12:47:25'), v: 0 },
    last: { t: at('2026-09-30T12:00:00'), v: 50 },
    atBoundary: boundary([['2026-09-25', 170.81], ['2026-09-26', 114.95]]),
    resets: [
      { t: at('2026-09-25T07:55:00'), before: 174.05, after: 0 },
      { t: at('2026-09-25T09:52:00'), before: 1.62, after: 0 },
    ],
  };
  const ev = counterEvents(['2026-09-25'], c, c.last.t);
  expect(ev.map((e) => [e.startValue, e.endValue, +e.value.toFixed(2), e.startedBy, e.endedBy])).toEqual([
    [170.81, 174.05, 3.24, 'day start', 'reset'],
    [0, 1.62, 1.62, 'reset', 'reset'],
    [0, 114.95, 114.95, 'reset', 'day end'],
  ]);
  const [day] = buildDays(['2026-09-25'], [], eventIncrements(ev), c.first.t, c.last.t, at('2026-09-30T12:00:00'));
  expect(day.influxMt).toBe(119.81);
  // The naive way, for the record: end − start is negative on a reset day.
  expect(+(114.95 - 170.81).toFixed(2)).toBe(-55.86);
});

test('a reset that lands on a non-zero reading still counts that reading', () => {
  const c = {
    first: { t: at('2026-09-21T12:47:25'), v: 0 },
    last: { t: at('2026-09-30T12:00:00'), v: 0 },
    atBoundary: boundary([['2026-09-22', 10], ['2026-09-23', 20]]),
    resets: [{ t: at('2026-09-22T09:00:00'), before: 12, after: 0.8 }],   // already 0.8 t by the next reading
  };
  const ev = counterEvents(['2026-09-22'], c, c.last.t);
  expect(ev.map((e) => +e.value.toFixed(2))).toEqual([2, 20]);           // 12 − 10, then 0 → 20 (includes the 0.8)
});

test('the day still running ends at the latest reading; a day before the counter existed has none', () => {
  const now = at('2026-10-01T15:00:00');
  const c = {
    first: { t: at('2026-09-21T12:47:25'), v: 4 },
    last: { t: now, v: 90.03 },
    atBoundary: boundary([['2026-09-22', 109.97], ['2026-10-01', 182.63]]),
    resets: [{ t: at('2026-10-01T07:14:00'), before: 182.63, after: 0 }],
  };
  const ev = counterEvents(['2026-09-20', '2026-09-21', '2026-10-01'], c, now);
  expect(ev.filter((e) => e.date === '2026-09-20')).toHaveLength(0);
  const d21 = ev.filter((e) => e.date === '2026-09-21');
  expect(d21[0]).toMatchObject({ startedBy: 'first reading', startValue: 4, endValue: 109.97, endedBy: 'day end' });
  const today = ev.filter((e) => e.date === '2026-10-01');
  // A finished day whose last reading is 2 s before its 06:00 end still ends at "day end".
  const done = counterEvents(['2026-09-29'], {
    first: c.first, last: { t: at('2026-09-30T05:59:58'), v: 163.34 },
    atBoundary: boundary([['2026-09-29', 160.21], ['2026-09-30', 163.34]]), resets: [],
  }, now);
  expect(done.at(-1)).toMatchObject({ endedBy: 'day end', endValue: 163.34 });
  expect(today.at(-1)).toMatchObject({ endedBy: 'latest reading', endValue: 90.03 });
});
