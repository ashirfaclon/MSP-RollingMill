/** HSM shift setup checklist: the shift's start and end time are checked and saved with the entry (the user, 23 Nov 2026). */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Env } from '../../src/config/env';
import { resetLogbookSession } from '../../src/integrations/logbook/client';
import { saveSetup } from '../../src/modules/forms-db/checklist.store';

const env = { iosenseBearer: 'Bearer t', iosenseBase: 'https://connector.test', iosenseOrg: 'https://iosense.test', logbookInsightId: 'INS_test' } as unknown as Env;

describe('shift setup checklist', () => {
  let added: Record<string, unknown>[] = [];
  beforeEach(() => {
    resetLogbookSession();
    added = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
      if (url.includes('/fetch/paginated/')) return new Response(JSON.stringify({ success: true, data: { data: [], totalCount: 0 } }));
      if (url.endsWith('/insightResult/add')) { added.push(JSON.parse(init.body).result); return new Response(JSON.stringify({ success: true })); }
      return new Response('{}', { status: 404 });
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  test('the shift times are saved as typed; a night shift may end the next morning', async () => {
    const r = await saveSetup(env, { values: { Date: '2026-11-22', Shift: 'Night', 'Shift start time': '20:00', 'Shift end time': '07:30', 'Shift in-charge': 'A. Kumar' } }, 'u');
    expect(r.ok).toBe(true);
    expect(added[0]).toMatchObject({ Date: '2026-11-22', Shift: 'Night', 'Shift start time': '20:00', 'Shift end time': '07:30', 'Shift in-charge': 'A. Kumar' });
    // Column order: the times right after the shift.
    expect(Object.keys(added[0]).slice(0, 4)).toEqual(['Date', 'Shift', 'Shift start time', 'Shift end time']);
  });

  test('not a time, or ending when it starts: refused before anything is written', () => {
    // Refused as the request is checked (like a bad date), before the logbook is called.
    expect(() => saveSetup(env, { values: { Date: '2026-11-22', Shift: 'Day', 'Shift start time': '8 am' } }, 'u')).toThrow(expect.objectContaining({ status: 400, code: 'bad_time' }));
    expect(() => saveSetup(env, { values: { Date: '2026-11-22', Shift: 'Day', 'Shift start time': '24:00' } }, 'u')).toThrow(/HH:MM/);
    expect(() => saveSetup(env, { values: { Date: '2026-11-22', Shift: 'Day', 'Shift start time': '08:00', 'Shift end time': '08:00' } }, 'u')).toThrow(/different time/);
    expect(added).toHaveLength(0);
  });
});
