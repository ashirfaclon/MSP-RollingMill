/** RMS plan: the monthly plans April–October 2026, spread over calendar days, halved per shift. */
import { describe, expect, test } from 'vitest';
import type { Env } from '../../src/config/env';
import { rmsPlan } from '../../src/modules/rms/plan.service';

// No ERP cache and no logbook session: the plan alone.
const env = { erpCacheDir: 'data-test-none', iosenseBearer: null, logbookInsightId: null } as unknown as Env;

describe('RMS plan', () => {
  test('Oct 2026: 13,499 ÷ 31 calendar days (the shutdown day is not dated) = 435.45 a day, 217.73 a shift', async () => {
    const r = await rmsPlan(env, '2026-10-01', '2026-10-31');
    expect(r.days[0]).toMatchObject({ planMt: 435.45, byShift: { Day: 217.73, Night: 217.73 } });
    expect(r.totals.planMt).toBeCloseTo(13499, 0);
  });

  test('every month April–October adds up to its plan; none before April or after October', async () => {
    const r = await rmsPlan(env, '2026-03-31', '2026-11-01');
    expect(r.days[0].planMt).toBeNull();
    expect(r.days.at(-1)!.planMt).toBeNull();
    expect(r.totals.planMt).toBeCloseTo(12478 + 14354.55 + 13785.66 + 14923.4 + 14447.16 + 14447.16 + 13499, -1);
  });
});
