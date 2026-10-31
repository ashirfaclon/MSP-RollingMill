/** RMS plan: only from the logbook Production Plan form (the user, 31 Oct 2026) — no Excel import left. */
import { describe, expect, test } from 'vitest';
import type { Env } from '../../src/config/env';
import { rmsPlan } from '../../src/modules/rms/plan.service';

// No ERP cache and no logbook session: nothing to read.
const env = { erpCacheDir: 'data-test-none', iosenseBearer: null, logbookInsightId: null } as unknown as Env;

describe('RMS plan', () => {
  test('no logbook: no plan on any date (the old Excel months are not read any more)', async () => {
    const r = await rmsPlan(env, '2026-10-01', '2026-10-31');
    expect(r.days.every((d) => d.planMt === null)).toBe(true);
    expect(r.totals.planMt).toBeNull();
    expect(r.source).toBe('Logbook Production Plan: no plan saved for this period');
  });
});
