/** Equipment settings: defaults from config/equipment.ts, edits from the logbook (the user, 31 Oct 2026). */
import { describe, expect, test } from 'vitest';
import type { Env } from '../../src/config/env';
import { HSM_MOTOR_DEFAULTS, RMD_OIL_TANK_DEFAULTS } from '../../src/config/equipment';
import { capacityL, hsmMotorRatings, rmdOilTanks, saveHsmMotorRatings, saveRmdOilTanks } from '../../src/modules/forms-db/equipment.store';
import { tankLitres } from '../../src/modules/rmd/asset.service';

// No logbook session: only the defaults.
const env = { erpCacheDir: 'data-test-none', iosenseBearer: null, logbookInsightId: null } as unknown as Env;

describe('defaults', () => {
  test('HSM: 11 stand motors, RM 1–5 and FM 1–6', () => {
    expect(HSM_MOTOR_DEFAULTS.map((m) => m.stand)).toEqual(['RM 1', 'RM 2', 'RM 3', 'RM 4', 'RM 5', 'FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6']);
  });
  test('RMD: the capacities the plant gave — 2,670 / 1,275 / 932 L', () => {
    const cap = (t: string) => capacityL(RMD_OIL_TANK_DEFAULTS.find((x) => x.tank === t)!);
    expect([cap('20-r-stand'), cap('intermill'), cap('new-continuous-stand-7-8')]).toEqual([2670, 1275, 932]);
  });
  test('litres from a level: level × length × width', () => {
    expect(tankLitres('20-r-stand', 10)).toEqual({ litres: Math.round(10 * 0.0254 * 1.63 * 1.26 * 1000), capacityL: 2670 });
    const bigger = new Map([['20-r-stand', { lengthM: 2, widthM: 1, depthM: 1 }]]);
    expect(tankLitres('20-r-stand', 10, bigger)).toEqual({ litres: Math.round(10 * 0.0254 * 2 * 1000), capacityL: 2000 });
  });
});

describe('values in use without the logbook', () => {
  test('the defaults, not edited', async () => {
    const m = await hsmMotorRatings(env);
    expect(m.logbook.connection).toBe('down');
    expect(m.rows.find((r) => r.stand === 'FM 3')).toMatchObject({ ratedCurrentA: 1807, defaultA: 1807, edited: false });
    const t = await rmdOilTanks(env);
    expect(t.rows.find((r) => r.tank === 'intermill')).toMatchObject({ capacityL: 1275, edited: false });
  });
});

describe('an edit is checked before it is saved', () => {
  test('unknown stand or tank', async () => {
    await expect(saveHsmMotorRatings(env, { rows: [{ stand: 'FM 9', ratedCurrentA: 900 }] }, 'test')).rejects.toThrow(/unknown stand/);
    await expect(saveRmdOilTanks(env, { rows: [{ tank: 'x', lengthM: 1, widthM: 1, depthM: 1 }] }, 'test')).rejects.toThrow(/unknown tank/);
  });
  test('a value out of range', async () => {
    await expect(saveHsmMotorRatings(env, { rows: [{ stand: 'FM 1', ratedCurrentA: 0 }] }, 'test')).rejects.toThrow(/rated current/);
    await expect(saveRmdOilTanks(env, { rows: [{ tank: 'intermill', lengthM: 25, widthM: 1, depthM: 1 }] }, 'test')).rejects.toThrow(/lengthM/);
  });
  test('nothing changed: nothing written', async () => {
    expect(await saveHsmMotorRatings(env, { rows: [{ stand: 'FM 1', ratedCurrentA: 1214 }] }, 'test')).toMatchObject({ ok: true, saved: 0 });
  });
});
