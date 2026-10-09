/**
 * HSM power from the logbook form — summed by the date the plant entered, all meters, nothing
 * corrected. A stand-in logbook serves pages newest first and ignores filters, like the real one.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { Env } from '../../src/config/env';
import { powerReport, resetPowerIndex, specificEnergy, POWER_FORM } from '../../src/modules/hsm/power.service';
import { resetLogbookSession } from '../../src/integrations/logbook/client';

const entry = (id: string, date: string, equipment: string, kwh: number | string, created: string, form = POWER_FORM) => ({
  _id: id, tags: [form], resultName: form, createdAt: created, invocationTime: created,
  result: { date, shift: 'DAY', equipment, 'previous-meter-reading': 100, 'present-meter-reading': 100 + Number(kwh || 0), 'power-consumed': kwh },
});
// Newest first, as the engine returns them; one row of another form; one wrongly dated row.
const ROWS = [
  entry('a', '2026-10-07', 'ROUGHING VCB-01', 240.204, '2026-10-08T15:06:00Z'),
  entry('b', '2026-10-07', 'FINISHING VCB-02', 650.506, '2026-10-08T15:05:00Z'),
  entry('c', '2026-10-07', 'BILLET HEATER VCB-03', 211.619, '2026-10-08T15:04:00Z'),
  entry('x', '2026-10-07', 'SOMETHING', 9999, '2026-10-08T15:03:00Z', 'electrical-hsm/electrical-delays'),
  entry('d', '2026-10-06', 'ROUGHING VCB-01', '', '2026-10-06T17:12:00Z'),
  entry('e', '2026-10-13', 'FINISHING VCB-02', 495.184, '2026-10-01T10:00:00Z'),
];

let server: Server;
let base = '';
let pages = 0;
beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      pages += 1;
      const { pagination } = JSON.parse(body || '{}') as { pagination: { page: number; count: number } };
      const start = (pagination.page - 1) * pagination.count;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { data: ROWS.slice(start, start + pagination.count), totalCount: ROWS.length } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => server.close());
beforeEach(() => { resetPowerIndex(); resetLogbookSession(); pages = 0; });

const env = (patch: Partial<Env> = {}): Env => ({
  influxUrl: null, influxOrg: null, influxBucket: null, influxToken: null, influxUser: null, influxPassword: null,
  emsInfluxUrl: null, emsInfluxOrg: null, emsInfluxBucket: 'EMS Data', emsInfluxToken: null,
  erpDsn: null, erpUser: null, erpPassword: null, erpOracleClientDir: null, erpCacheDir: 'data-test-none',
  iosenseBearer: 'Bearer test', iosenseBase: base, iosenseOrg: 'https://iosense.io', logbookInsightId: 'INS_test',
  pollIntervalSeconds: 60, ...patch,
});

describe('power consumption from the logbook', () => {
  test('a day is the sum of every entry dated that day, all meters, other forms left out', async () => {
    const r = await powerReport(env(), '2026-10-07', '2026-10-07', Date.parse('2026-10-09T08:00:00Z'));
    expect(r.totals.kwh).toBe(1102.33);
    expect(r.totals.entries).toBe(3);
    expect(r.totals.byEquipment).toEqual({ 'ROUGHING VCB-01': 240.2, 'FINISHING VCB-02': 650.51, 'BILLET HEATER VCB-03': 211.62 });
    expect(r.entries.map((e) => e.equipment)).not.toContain('SOMETHING');
  });

  test('the date is used as entered — a wrongly dated entry shows on that date, not corrected', async () => {
    const r = await powerReport(env(), '2026-10-13', '2026-10-13', Date.parse('2026-10-09T08:00:00Z'));
    expect(r.days[0]).toMatchObject({ date: '2026-10-13', kwh: 495.18, entries: 1 });
  });

  test('a blank reading is listed but adds nothing; a day with no entries is null, not 0', async () => {
    const r = await powerReport(env(), '2026-10-05', '2026-10-06', Date.parse('2026-10-09T08:00:00Z'));
    expect(r.days).toEqual([
      expect.objectContaining({ date: '2026-10-05', kwh: null, entries: 0 }),
      expect.objectContaining({ date: '2026-10-06', kwh: null, entries: 1 }),
    ]);
    expect(r.entries[0]).toMatchObject({ kwh: null, equipment: 'ROUGHING VCB-01' });
  });

  test('read once, then served from the index', async () => {
    const now = Date.parse('2026-10-09T08:00:00Z');
    await powerReport(env(), '2026-10-07', '2026-10-07', now);
    const after = pages;
    await powerReport(env(), '2026-10-06', '2026-10-07', now);
    expect(pages).toBe(after);
  });

  test('no insight configured, or no session: down and stated, never a made-up figure', async () => {
    expect((await powerReport(env({ logbookInsightId: null }), '2026-10-07', '2026-10-07')).logbook).toMatchObject({ connection: 'down' });
    const r = await powerReport(env({ iosenseBearer: null }), '2026-10-07', '2026-10-07');
    expect(r).toMatchObject({ logbook: { connection: 'down' }, totals: { kwh: null, entries: 0 } });
  });
});

describe('specific energy', () => {
  test('kWh ÷ MT, rounded; no figure without both', () => {
    expect(specificEnergy(174916.99, 1141.08)).toBe(153.29);
    expect(specificEnergy(null, 1141.08)).toBeNull();
    expect(specificEnergy(15221.3, 0)).toBeNull();
    expect(specificEnergy(15221.3, null)).toBeNull();
  });
});
