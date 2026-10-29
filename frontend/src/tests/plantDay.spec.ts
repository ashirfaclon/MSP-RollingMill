/**
 * The plant day: a date is 08:00 IST → 08:00 IST next day, never midnight to midnight.
 */
import { test, expect } from '@playwright/test';
import { cycleLabel, dayCount, plantDate, plantDayStartMs, shiftsLabel } from '@/lib/plantDay';
import { presetDates } from '@/state/globalSel';

const at = (d: string, hhmm: string) => Date.parse(`${d}T${hhmm}:00+05:30`);

test('selecting 24 Sep means 24 Sep 08:00 → 25 Sep 08:00', () => {
  expect(plantDayStartMs('2026-09-24')).toBe(at('2026-09-24', '08:00'));
  expect(cycleLabel('2026-09-24', '2026-09-24')).toBe('24 Sep 08:00 IST → 25 Sep 08:00 IST');
  expect(cycleLabel('2026-09-22', '2026-09-28')).toBe('22 Sep 08:00 IST → 29 Sep 08:00 IST');
  expect(dayCount('2026-09-22', '2026-09-28')).toBe(7);
});

test('an instant before 08:00 belongs to the previous plant date', () => {
  expect(plantDate(at('2026-09-25', '07:59'))).toBe('2026-09-24');
  expect(plantDate(at('2026-09-25', '08:00'))).toBe('2026-09-25');
  expect(plantDate(at('2026-09-25', '23:59'))).toBe('2026-09-25');
});

test('presets resolve to whole plant days, counted from the plant date running now', () => {
  const early = at('2026-10-01', '03:00');   // still the 30 Sep cycle
  expect(presetDates('today', early)).toEqual({ from: '2026-09-30', to: '2026-09-30' });
  expect(presetDates('yesterday', early)).toEqual({ from: '2026-09-29', to: '2026-09-29' });

  const noon = at('2026-10-01', '12:00');    // Thursday
  expect(presetDates('today', noon)).toEqual({ from: '2026-10-01', to: '2026-10-01' });
  expect(presetDates('current_week', noon)).toEqual({ from: '2026-09-28', to: '2026-10-01' });
  expect(presetDates('previous_week', noon)).toEqual({ from: '2026-09-21', to: '2026-09-27' });
  expect(presetDates('previous_7_days', noon)).toEqual({ from: '2026-09-24', to: '2026-09-30' });
  expect(presetDates('current_month', noon)).toEqual({ from: '2026-10-01', to: '2026-10-01' });
  expect(presetDates('previous_month', noon)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  expect(presetDates('previous_year', noon)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
});

test('a mill day can start on the half hour (RMS 09:30), and shifts follow it', () => {
  expect(cycleLabel('2026-10-12', '2026-10-12', 9.5)).toBe('12 Oct 09:30 IST → 13 Oct 09:30 IST');
  // 09:20 IST on 12 Oct is still RMS's 11 Oct; 09:40 is 12 Oct.
  expect(plantDate(Date.parse('2026-10-12T03:50:00Z'), 9.5)).toBe('2026-10-11');
  expect(plantDate(Date.parse('2026-10-12T04:10:00Z'), 9.5)).toBe('2026-10-12');
  expect(shiftsLabel(9)).toBe('Day 09:00–21:00 IST · Night 21:00–09:00 IST');
  expect(shiftsLabel(9.5)).toBe('Day 09:30–21:30 IST · Night 21:30–09:30 IST');
});
