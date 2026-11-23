/** HSM management KPIs from the ERP log sheet: cast, delivery, prime, rolling % (Online only), cold power (Offline only). */
import { describe, expect, test } from 'vitest';
import { summariseRolling } from '../../src/modules/hsm/rolling.service';

// 16–17 Nov 2026 as the ERP holds them.
const ROWS = [
  { date: '2026-11-16', vrno: 'a', mt: 180.34, mode: 'online' as const, v: { TOTAL_CAST_QTY: 192.718, DELIVERY_QTY: 190.161, INPUT_MT: 186.62, PRODUCTION_MT: 180.34, PRIME_MT: 180.34, POWER_CONSUMPTION_IN_KWH: 13723 } },
  { date: '2026-11-17', vrno: 'b', mt: 109.79, mode: 'online' as const, v: { TOTAL_CAST_QTY: 119.681, DELIVERY_QTY: 113.19, INPUT_MT: 113.19, PRODUCTION_MT: 109.79, PRIME_MT: 109.79, POWER_CONSUMPTION_IN_KWH: 8949 } },
  { date: '2026-11-17', vrno: 'c', mt: 1.21, mode: 'offline' as const, v: { TOTAL_CAST_QTY: 1.25, DELIVERY_QTY: 1.25, INPUT_MT: 1.25, PRODUCTION_MT: 1.21, PRIME_MT: 1.21, POWER_CONSUMPTION_IN_KWH: 780 } },
];
const DAYS = ['2026-11-16', '2026-11-17'];

describe('HSM rolling KPIs from the log sheet', () => {
  test('one Online entry: the ERP\'s own rolling percentages (96.836, 98.138)', () => {
    expect(summariseRolling('d', '16 Nov', ['2026-11-16'], ROWS, 'online')).toMatchObject({
      castMt: 192.72, deliveryMt: 190.16, productionMt: 180.34, primeMt: 180.34, rollingInCastingPct: 96.84, rollingInDeliveryPct: 98.14,
      coldPowerKwh: null, coldPowerKwhPerMt: null,
    });
  });
  test('Both: quantities add Online and Offline; rolling % stays Online only; cold power is Offline only', () => {
    expect(summariseRolling('p', 'Two days', DAYS, ROWS, 'all')).toMatchObject({
      entryDays: 2, castMt: 313.65, deliveryMt: 304.6, productionMt: 291.34, primeMt: 291.34,
      // Online: 299.81 in ÷ 312.399 cast, ÷ 303.351 delivered — the Offline entry's 100 % is not counted.
      rollingInCastingPct: 95.97, rollingInDeliveryPct: 98.83,
      // 780 kWh ÷ 1.21 MT = the ERP's 644.628.
      coldPowerKwh: 780, coldPowerKwhPerMt: 644.63,
    });
  });
  test('Offline: only the Offline entries\' quantities', () => {
    expect(summariseRolling('p', 'Two days', DAYS, ROWS, 'offline')).toMatchObject({ entryDays: 1, castMt: 1.25, productionMt: 1.21, coldPowerKwh: 780 });
  });
  test('a cache synced before the split has no rolling: Both still adds, the rest is null', () => {
    const old = ROWS.map(({ mode: _m, ...r }) => r);
    expect(summariseRolling('p', 'Two days', DAYS, old, 'all')).toMatchObject({ productionMt: 291.34, rollingInCastingPct: null, coldPowerKwh: null });
  });
});
