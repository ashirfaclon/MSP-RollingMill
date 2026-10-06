/**
 * Backend connectivity — the DEGRADED paths, which need no plant access.
 *
 * Every client must answer "not configured" and "unreachable" with an EMPTY series and a
 * stated reason: never an exception, never a substituted value (handover §10.10).
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Env } from '../../src/config/env';
import { MSG } from '../../src/shared/messages';
import { bucketSeconds } from '../../src/integrations/influx';
import { fetchLatest, fetchRaw, fetchWindow, probeHistorian } from '../../src/integrations/historian/client';
import type { TagDef } from '../../src/integrations/historian/tags';
import { fetchEmsRaw, probeEms, type EmsDef } from '../../src/integrations/ems/client';
import { erpStatus } from '../../src/integrations/erp/cache';
import {
  exchangeSsoToken, fetchLogbookWindow, num, probeLogbook, resetLogbookSession, rowTime,
} from '../../src/integrations/logbook/client';

/** Nothing listens here: connections are refused immediately. */
const DEAD = 'http://127.0.0.1:9';

const BLANK: Env = {
  influxUrl: null, influxOrg: null, influxBucket: null, influxToken: null, influxUser: null, influxPassword: null,
  emsInfluxUrl: null, emsInfluxOrg: null, emsInfluxBucket: 'EMS Data', emsInfluxToken: null,
  erpDsn: null, erpUser: null, erpPassword: null, erpOracleClientDir: null, erpCacheDir: 'data-test-none',
  iosenseBearer: null, iosenseBase: DEAD, iosenseOrg: 'https://iosense.io', logbookInsightId: null,
  pollIntervalSeconds: 60,
};
const env = (patch: Partial<Env>): Env => ({ ...BLANK, ...patch });

const TAG: TagDef = { key: 'drive_kw', label: 'Drive power', measurement: 'HSM', unitTag: 'HSM', field: 'X', unit: 'kW', scale: 1, mapped: true };
const UNMAPPED: TagDef = { ...TAG, key: 'unmapped', mapped: false };
const FEEDER: EmsDef = { key: 'stands', name: 'HSM STANDS', label: 'Stands', mapped: true };
const T1 = Date.UTC(2026, 8, 29, 6);
const T0 = T1 - 3_600_000;

describe('bucket rule', () => {
  test('about 500 points per series, never under 60 s', () => {
    expect(bucketSeconds(T0, T0 + 10 * 60_000)).toBe(60);
    expect(bucketSeconds(T0, T0 + 24 * 3_600_000)).toBe(180);
    expect(bucketSeconds(T0, T0 + 30 * 86_400_000)).toBe(5220);
  });
});

describe('process historian', () => {
  test('not configured → down, stated, an empty series for every requested tag', async () => {
    const w = await fetchWindow(BLANK, T0, T1, [TAG, UNMAPPED]);
    expect(w).toMatchObject({ connection: 'down', message: MSG.HISTORIAN_NOT_CONFIGURED });
    expect(w.series).toEqual({ drive_kw: [], unmapped: [] });
    expect((await fetchLatest(BLANK, T0, T1, [TAG])).latest).toEqual({ drive_kw: null });
    expect((await fetchRaw(BLANK, T0, T1, [TAG])).series).toEqual({ drive_kw: [] });
    expect(await probeHistorian(BLANK)).toMatchObject({ connection: 'down', configured: false, measurements: [] });
  });

  test('unreachable → down, stated, empty — no exception', async () => {
    const e = env({ influxUrl: DEAD, influxBucket: 'b', influxToken: 't' });
    const w = await fetchWindow(e, T0, T1, [TAG]);
    expect(w).toMatchObject({ connection: 'down', message: MSG.HISTORIAN_UNREACHABLE, series: { drive_kw: [] } });
    expect((await fetchRaw(e, T0, T1, [TAG])).message).toBe(MSG.HISTORIAN_UNREACHABLE);
    expect(await probeHistorian(e, 'HSM')).toMatchObject({ connection: 'down', configured: true, message: MSG.HISTORIAN_UNREACHABLE });
  });

  test('an unmapped tag is never queried and never produces a value', async () => {
    // Even against a dead server: with nothing mapped there is no query to fail.
    const w = await fetchWindow(env({ influxUrl: DEAD, influxBucket: 'b', influxToken: 't' }), T0, T1, [UNMAPPED]);
    expect(w).toMatchObject({ connection: 'up', message: MSG.HISTORIAN_NO_TAGS, series: { unmapped: [] } });
  });
});

describe('electrical meters', () => {
  test('not configured and unreachable both return empty with their own reason', async () => {
    expect(await fetchEmsRaw(BLANK, T0, T1, [FEEDER])).toEqual({ connection: 'down', message: MSG.EMS_NOT_CONFIGURED, series: { stands: [] } });
    const dead = env({ emsInfluxUrl: DEAD, emsInfluxToken: 't' });
    expect(await fetchEmsRaw(dead, T0, T1, [FEEDER])).toEqual({ connection: 'down', message: MSG.EMS_UNREACHABLE, series: { stands: [] } });
    expect(await probeEms(dead)).toMatchObject({ connection: 'down', configured: true, equipment: [], fresh: false });
  });
});

describe('ERP cache', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'erp-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const at = (d: string) => env({ erpCacheDir: d, erpDsn: 'x', erpUser: 'u', erpPassword: 'p' });
  const cache = { syncedAt: '2026-09-29T10:00:00.000Z', serverTime: '', source: 's', divisions: [{ entity: 'MP', division: 'HS', assetRows: 3 }] };

  test('never synced is a stated state, not a crash', () => {
    expect(erpStatus(at(dir))).toMatchObject({ connection: 'down', message: MSG.ERP_NOT_SYNCED, syncedAt: null, divisions: [] });
  });

  test('a failed first sync says the ERP could not be reached', () => {
    writeFileSync(path.join(dir, 'erp-hsm-sync.json'), JSON.stringify({ attemptedAt: 'x', ok: false, message: 'ERP sync failed', durationMs: 1 }));
    expect(erpStatus(at(dir))).toMatchObject({ connection: 'down', message: MSG.ERP_NEVER_REACHED });
  });

  test('a good sync is up; a later failure keeps the previous data and says so', () => {
    writeFileSync(path.join(dir, 'erp-hsm.json'), JSON.stringify(cache));
    writeFileSync(path.join(dir, 'erp-hsm-sync.json'), JSON.stringify({ attemptedAt: 'x', ok: true, message: 'ok', durationMs: 1 }));
    const now = Date.parse(cache.syncedAt) + 30 * 60_000;
    expect(erpStatus(at(dir), now)).toMatchObject({ connection: 'up', message: MSG.ERP_UP, ageMinutes: 30, divisions: cache.divisions });

    // Rewrite the attempt with a later mtime so the gated reader re-parses it.
    const f = path.join(dir, 'erp-hsm-sync.json');
    writeFileSync(f, JSON.stringify({ attemptedAt: 'y', ok: false, message: 'ERP sync failed', durationMs: 1 }));
    const later = new Date(Date.now() + 5_000);
    utimesSync(f, later, later);
    expect(erpStatus(at(dir), now)).toMatchObject({ connection: 'down', message: MSG.ERP_SYNC_FAILED, divisions: cache.divisions });
  });
});

describe('logbook', () => {
    beforeEach(() => resetLogbookSession());

  test('no session → down, stated, no rows', async () => {
    expect(await probeLogbook(BLANK)).toMatchObject({ connection: 'down', configured: false, message: MSG.LOGBOOK_NO_SESSION });
    expect(await fetchLogbookWindow(T0, T1, T1, BLANK)).toEqual({ connection: 'down', message: MSG.LOGBOOK_NO_SESSION, rows: [], formCounts: {} });
  });

  test('a session but no mapped forms is stated, not guessed', async () => {
    const e = env({ iosenseBearer: 'Bearer x' });
    expect(await fetchLogbookWindow(T0, T1, T1, e)).toMatchObject({ connection: 'down', message: MSG.LOGBOOK_NOT_MAPPED, rows: [] });
  });

  test('unreachable → down, stated, no exception', async () => {
    const e = env({ iosenseBearer: 'Bearer x', logbookInsightId: 'ins' });
    expect(await probeLogbook(e)).toMatchObject({ connection: 'down', configured: true, message: MSG.LOGBOOK_UNREACHABLE });
    expect(await fetchLogbookWindow(T0, T1, T1, e)).toMatchObject({ connection: 'down', message: MSG.LOGBOOK_UNREACHABLE, rows: [] });
    expect(await exchangeSsoToken('abc', e)).toEqual({ ok: false, message: MSG.LOGBOOK_UNREACHABLE });
  });

  test('a rejected session is dropped, and then reported as expired', async () => {
    let calls = 0;
    const server: Server = createServer((req, res) => {
      calls += 1;
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, errors: ['Unauthorized'] }));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as { port: number };
    try {
      const e = env({ iosenseBearer: 'Bearer stale', iosenseBase: `http://127.0.0.1:${port}`, logbookInsightId: 'ins' });
      expect(await probeLogbook(e)).toMatchObject({ connection: 'down', message: MSG.LOGBOOK_SESSION_EXPIRED });
      // The bearer is gone: no further request is made with it.
      const before = calls;
      expect(await probeLogbook(e)).toMatchObject({ connection: 'down', configured: false, message: MSG.LOGBOOK_SESSION_EXPIRED });
      expect(await fetchLogbookWindow(T0, T1, T1, e)).toMatchObject({ connection: 'down', rows: [] });
      expect(calls).toBe(before);
    } finally {
      server.close();
    }
  });

  test('sample time: date+time is exact; date only and submission time are flagged', () => {
    expect(rowTime({ result: { date: '2026-09-29', time: '07:30 AM' } }, 'date+time'))
      .toEqual({ ms: Date.parse('2026-09-29T07:30:00+05:30'), entryTimed: false });
    expect(rowTime({ result: { date: '2026-09-29', time: '' } }, 'date+time'))
      .toEqual({ ms: Date.parse('2026-09-29T00:00:00+05:30'), entryTimed: true });
    expect(rowTime({ result: { date: '2026-09-29', shift: 'b' } }, 'date+shift'))
      .toEqual({ ms: Date.parse('2026-09-29T14:00:00+05:30'), entryTimed: true });
    expect(rowTime({ result: {}, createdAt: '2026-09-29T10:00:00Z' }, 'date+time'))
      .toEqual({ ms: Date.parse('2026-09-29T10:00:00Z'), entryTimed: true });
  });

  test('blanks stay blank', () => {
    expect([num(''), num('  '), num(null), num('x'), num('12.5'), num(0)]).toEqual([null, null, null, null, 12.5, 0]);
  });
});

describe('client-facing copy', () => {
  test('client-facing messages carry no implementation jargon', () => {
    for (const m of Object.values(MSG)) expect(m).not.toMatch(/influx|oracle|vpn|appsheet|bearer|\.env|flux|bruce/i);
  });
});
