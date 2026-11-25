/**
 * Electrical HSM → Billet Heater Performance & Mill Power (the user, 25 Nov 2026): one entry a day; MT and kWh
 * summed over a period, kWh per MT = Σ kWh ÷ Σ MT (one day: the form's own figure); test entries left out.
 */
import { describe, expect, test } from 'vitest';
import { perMt, summarise, toHeaterPowerDay } from '../../src/modules/hsm/heater-power.service';

/** The field names exactly as the form's first (test) entry sent them, 25 Nov 2026. */
const day = (date: string, over: Record<string, unknown> = {}) => toHeaterPowerDay({ result: {
  date, 'hot-billet-mt': 300, 'hot-billet-kwh': 24_000, 'hot-billet-kwh-mt': 80,
  'cold-billet-mt': 50, 'cold-billet-kwh': 6_000, 'cold-billet-kwh-mt': 120,
  'mill-power-mt': 350, 'mill-power-kwh': 35_000, 'mill-power-kwh-mt': 100, remarks: '', ...over,
} })!;

describe('one entry', () => {
  test('reads the three blocks; a test entry is left out', () => {
    expect(day('2026-11-24').v['hot-billet']).toEqual({ mt: 300, kwh: 24_000, kwhPerMt: 80 });
    expect(day('2026-11-24').v['mill-power']).toEqual({ mt: 350, kwh: 35_000, kwhPerMt: 100 });
    expect(toHeaterPowerDay({ result: { date: '2026-11-25', 'hot-billet-mt': 1, remarks: 'Test Entry' } })).toBeNull();
  });
});

describe('a period', () => {
  const days = [day('2026-11-23'), day('2026-11-24', { 'mill-power-mt': 150, 'mill-power-kwh': 18_000, 'mill-power-kwh-mt': 120, 'hot-billet-mt': 100 })];
  test('MT summed; kWh per MT is Σ kWh ÷ Σ MT, not the mean of the days', () => {
    const t = summarise('total', 'Total', ['2026-11-23', '2026-11-24'], days);
    expect(t.hotBilletMt).toBe(400);
    expect(t.millPowerMt).toBe(500);
    expect(t.millPowerKwhPerMt).toBe(106);   // 53 000 ÷ 500 — the mean of 100 and 120 would be 110
    expect(t.entryDays).toBe(2);
  });
  test('one day: the form\'s own figure; without MT and kWh, the form\'s kWh per MT', () => {
    expect(summarise('d', 'd', ['2026-11-23'], days).millPowerKwhPerMt).toBe(100);
    expect(perMt([day('2026-11-23', { 'mill-power-mt': '', 'mill-power-kwh': '' })], 'mill-power')).toBe(100);
    expect(summarise('d', 'd', ['2026-11-25'], days)).toMatchObject({ entryDays: 0, hotBilletMt: null, millPowerKwhPerMt: null });
  });
});
