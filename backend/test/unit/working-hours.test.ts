/** HSM working hours from the Shift Setup Checklist (the user, 24 Nov 2026): windows of the plant day, production inside them. */
import { describe, expect, test } from 'vitest';
import { productionIn, windowOf } from '../../src/modules/hsm/working-hours';

const ist = (s: string) => Date.parse(`${s}+05:30`);

describe('a checklist entry\'s window', () => {
  test('Day 08:00–16:00 on 22 Nov is 22 Nov 08:00 → 16:00 IST', () => {
    expect(windowOf('2026-11-22', 'Day', '08:00', '16:00')).toMatchObject({ startMs: ist('2026-11-22T08:00:00'), endMs: ist('2026-11-22T16:00:00') });
  });
  test('Night 20:00–08:00 ends the next morning', () => {
    expect(windowOf('2026-11-22', 'Night', '20:00', '08:00')).toMatchObject({ startMs: ist('2026-11-22T20:00:00'), endMs: ist('2026-11-23T08:00:00') });
  });
  test('a start before 08:00 is the next calendar day of the plant day', () => {
    expect(windowOf('2026-11-22', 'Night', '01:00', '05:30')).toMatchObject({ startMs: ist('2026-11-23T01:00:00'), endMs: ist('2026-11-23T05:30:00') });
  });
  test('a missing or bad time gives no window', () => {
    expect(windowOf('2026-11-22', 'Day', '', '16:00')).toBeNull();
    expect(windowOf('2026-11-22', 'Day', '8:00', '16:00')).toBeNull();
  });
});

describe('production in the working hours', () => {
  const day = windowOf('2026-11-22', 'Day', '08:00', '16:00')!;
  const night = windowOf('2026-11-22', 'Night', '20:00', '02:00')!;
  const ticks = [
    { t: ist('2026-11-22T07:59:00'), v: 1 },    // before the day shift
    { t: ist('2026-11-22T09:00:00'), v: 2.5 },  // day
    { t: ist('2026-11-22T16:00:00'), v: 1 },    // the day shift's last minute counts
    { t: ist('2026-11-22T18:00:00'), v: 4 },    // the gap between the shifts does not
    { t: ist('2026-11-22T23:00:00'), v: 3 },    // night
    { t: ist('2026-11-23T03:00:00'), v: 5 },    // after the night shift
  ];
  test('both windows added, the gap left out', () => {
    expect(productionIn(ticks, [day, night])).toBe(6.5);
  });
  test('no window: nothing', () => {
    expect(productionIn(ticks, [])).toBe(0);
  });
});
