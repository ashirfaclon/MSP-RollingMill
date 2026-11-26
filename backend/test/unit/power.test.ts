/**
 * HSM power from the logbook form — summed by the date the plant entered, all meters, nothing
 * corrected. A stand-in logbook serves pages newest first and honours `filter` (one form tag,
 * submission dates) and nothing else, like the real one.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { Env } from '../../src/config/env';
import { powerReport, rmdPowerReport, rmsPowerReport, specificEnergy, POWER_FORM } from '../../src/modules/power/power.service';
import { resetLogbookSession } from '../../src/integrations/logbook/client';

const entry = (id: string, date: string, equipment: string, kwh: number | string, created: string, form = POWER_FORM) => ({
  _id: id, tags: [form], resultName: form, createdAt: created, invocationTime: created,
  result: { date, shift: 'DAY', equipment, 'previous-meter-reading': 100, 'present-meter-reading': 100 + Number(kwh || 0), 'power-consumed': kwh },
});
/** An RMD reading: one form per meter (VCB n), actual-kwh-vcb-n. */
const vcbEntry = (id: string, n: number, date: string, kwh: number, created: string) => {
  const form = `tmt-electrical-department/power-reading-vcb-${n}`;
  return {
    _id: id, tags: [form], resultName: form, createdAt: created, invocationTime: created,
    result: { date, shift: 'DAY', [`previous-kwh-vcb-${n}`]: 1000, [`present-kwh-vcb-${n}`]: 1000 + kwh, [`actual-kwh-vcb-${n}`]: kwh },
  };
};
// Newest first, as the engine returns them; one row of another form; one wrongly dated row;
// two RMD readings mixed in (they belong to RMD only).
/** An RMS reading: the RMS Daily Power Consumption Record, VCB-1 (1250 A). */
const rmsEntry = (id: string, date: string, kwh: number, remarks: string, created: string) => {
  const form = 'rms-electrical-logbook/daily-power-consumption-record';
  return {
    _id: id, tags: [form], resultName: form, createdAt: created, invocationTime: created,
    result: { date, shift: 'DAY', 'previous-kwh-vcb-1-1250amp': 1000, 'present-kwh-vcb-1-1250amp': 1000 + kwh, 'actual-kwh-vcb-1-1250amp': kwh, remarks },
  };
};
const ALL = [
  vcbEntry('r1', 1, '2026-10-07', 18022.303, '2026-10-08T15:07:00Z'),
  vcbEntry('r2', 3, '2026-10-07', 4441.558, '2026-10-08T15:06:30Z'),
  entry('a', '2026-10-07', 'ROUGHING VCB-01', 240.204, '2026-10-08T15:06:00Z'),
  entry('b', '2026-10-07', 'FINISHING VCB-02', 650.506, '2026-10-08T15:05:00Z'),
  entry('c', '2026-10-07', 'BILLET HEATER VCB-03', 211.619, '2026-10-08T15:04:00Z'),
  entry('x', '2026-10-07', 'SOMETHING', 9999, '2026-10-08T15:03:00Z', 'electrical-hsm/electrical-delays'),
  entry('d', '2026-10-06', 'ROUGHING VCB-01', '', '2026-10-06T17:12:00Z'),
  entry('e', '2026-10-13', 'FINISHING VCB-02', 495.184, '2026-10-01T10:00:00Z'),
  rmsEntry('s1', '2026-10-07', 5120.5, '', '2026-10-08T05:00:00Z'),
  rmsEntry('s2', '2026-10-07', 111, 'Test Entry', '2026-10-08T05:10:00Z'),
];
let ROWS = [...ALL];

let server: Server;
let base = '';
let pages = 0;
beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      pages += 1;
      const { pagination, filter } = JSON.parse(body || '{}') as {
        pagination: { page: number; count: number }; filter?: { tags?: string[]; startDate?: string; endDate?: string };
      };
      const rows = ROWS.filter((r) => (!filter?.tags || (filter.tags.length === 1 && r.tags[0] === filter.tags[0]))
        && (!filter?.startDate || r.createdAt >= filter.startDate) && (!filter?.endDate || r.createdAt <= filter.endDate));
      const start = (pagination.page - 1) * pagination.count;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { data: rows.slice(start, start + pagination.count), totalCount: rows.length } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => server.close());
beforeEach(() => { ROWS = [...ALL]; resetLogbookSession(); pages = 0; });

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

  test('one call per form; a second request within 30 s shares it', async () => {
    const now = Date.parse('2026-10-09T08:00:00Z');
    await powerReport(env(), '2026-10-07', '2026-10-07', now);
    expect(pages).toBe(1);
    await powerReport(env(), '2026-10-07', '2026-10-07', now + 20_000);
    expect(pages).toBe(1);
    await rmdPowerReport(env(), '2026-10-07', '2026-10-07', now);
    expect(pages).toBe(4);   // VCB 1, 2, 3
  });

  test('an entry deleted in the logbook is gone on the next read', async () => {
    const now = Date.parse('2026-10-09T08:00:00Z');
    expect((await powerReport(env(), '2026-10-07', '2026-10-07', now)).totals.entries).toBe(3);
    ROWS = ROWS.filter((r) => r._id !== 'b');
    const r = await powerReport(env(), '2026-10-07', '2026-10-07', now + 31_000);
    expect(r.totals).toMatchObject({ entries: 2, kwh: 451.82 });
  });

  test('no insight configured, or no session: down and stated, never a made-up figure', async () => {
    expect((await powerReport(env({ logbookInsightId: null }), '2026-10-07', '2026-10-07')).logbook).toMatchObject({ connection: 'down' });
    const r = await powerReport(env({ iosenseBearer: null }), '2026-10-07', '2026-10-07');
    expect(r).toMatchObject({ logbook: { connection: 'down' }, totals: { kwh: null, entries: 0 } });
  });
});

describe('RMD power from the three VCB forms', () => {
  test('a day is the sum of actual-kwh-vcb-n over its readings; HSM entries stay out, and the reverse', async () => {
    const now = Date.parse('2026-10-09T08:00:00Z');
    const r = await rmdPowerReport(env(), '2026-10-07', '2026-10-07', now);
    expect(r.totals.kwh).toBe(22463.86);
    expect(r.equipment).toEqual(['VCB 1', 'VCB 3']);
    expect(r.entries[0]).toMatchObject({ equipment: 'VCB 1', previousReading: 1000, kwh: 18022.303 });
    // Production is not wired for RMD yet: specific energy is NA, never a guess.
    expect(r.totals).toMatchObject({ productionMt: null, kwhPerMt: null });
    expect((await powerReport(env(), '2026-10-07', '2026-10-07', now)).equipment).not.toContain('VCB 1');
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

describe('RMS power from its Daily Power Consumption Record', () => {
  test('a day is the sum of actual-kwh-vcb-1-1250amp; a test entry is left out; other mills\' forms stay out', async () => {
    const r = await rmsPowerReport(env(), '2026-10-07', '2026-10-07', Date.parse('2026-10-09T08:00:00Z'));
    expect(r.totals).toMatchObject({ kwh: 5120.5, entries: 1 });
    expect(r.equipment).toEqual(['VCB-1 (1250 A)']);
    expect((await powerReport(env(), '2026-10-07', '2026-10-07', Date.parse('2026-10-09T08:00:00Z'))).equipment).not.toContain('VCB-1 (1250 A)');
  });
});

describe('RMS power, the form as updated 26 Nov 2026: two meters, the shares given away, RMS\'s own power', () => {
  const FORM = 'rms-electrical-logbook/daily-power-consumption-record';
  const now = Date.parse('2026-11-23T08:00:00Z');
  const neu = (id: string, date: string, v: Record<string, unknown>) => ({
    _id: id, tags: [FORM], resultName: FORM, createdAt: `${date}T12:00:00Z`, invocationTime: `${date}T12:00:00Z`,
    result: { date, time: '', 'vcb-1-remarks': 'Ok', 'vcb-2-remarks': '', 'total-remarks': '', ...v },
  });
  const day1 = neu('n1', '2026-11-20', {
    'vcb-1-actual-kwh': 12000, 'vcb-1-actual-kvah': 13000, 'vcb-2-actual-kwh': 8000, 'vcb-2-actual-kvah': 8500,
    'total-actual-kwh': 20000, 'total-hsm-share-kwh': 3000, 'total-crusher-kwh': 500, 'total-colony-kwh': 200, 'total-rms-actual-power-kwh': 16300,
  });
  // The user's test entry, exactly as filed: "Test entry" sits in the new remarks boxes.
  const testEntry = neu('n2', '2026-11-20', {
    'vcb-1-actual-kwh': 10, 'vcb-1-actual-kvah': 10, 'vcb-1-remarks': 'Test entry', 'vcb-2-actual-kwh': 10, 'vcb-2-actual-kvah': 10, 'vcb-2-remarks': 'Test entry',
    'total-actual-kwh': 20, 'total-hsm-share-kwh': 1, 'total-crusher-kwh': 1, 'total-colony-kwh': 1, 'total-rms-actual-power-kwh': 17, 'total-remarks': 'test entry',
  });
  // An entry of the old form: VCB-1 only, kWh and kVAh, no sharing.
  const old = {
    _id: 'o1', tags: [FORM], resultName: FORM, createdAt: '2026-11-19T12:00:00Z', invocationTime: '2026-11-19T12:00:00Z',
    result: { date: '2026-11-19', shift: 'NIGHT', 'actual-kwh-vcb-1-1250amp': 12162, 'actual-kvah-vcb-1-1250amp': 13350, 'power-factor-vcb-1-1250amp': 0.91, remarks: 'Ok' },
  };

  test('the card\'s figure is RMS\'s own power; the split and power factors come with it; a test entry is left out', async () => {
    ROWS = [day1, testEntry] as unknown as typeof ROWS;
    const r = await rmsPowerReport(env(), '2026-11-20', '2026-11-20', now);
    expect(r.totals).toMatchObject({ kwh: 16300, entries: 1 });
    expect(r.totals.rms).toEqual({
      vcb1Kwh: 12000, vcb2Kwh: 8000, vcb1Kvah: 13000, vcb2Kvah: 8500, totalKwh: 20000,
      hsmShareKwh: 3000, crusherKwh: 500, colonyKwh: 200, rmsKwh: 16300, meterOnlyKwh: null,
      pf1: 0.923, pf2: 0.941, pf: 0.93,
    });
    expect(r.days[0].rms).toEqual(r.totals.rms);
    expect(r.basis).toBe('prime');
  });

  test('a blank form total is worked out: VCB-1 + VCB-2, less the shares', async () => {
    ROWS = [neu('n3', '2026-11-21', { 'vcb-1-actual-kwh': 100, 'vcb-2-actual-kwh': 50, 'total-hsm-share-kwh': 20, 'total-crusher-kwh': null, 'total-colony-kwh': 5 })] as unknown as typeof ROWS;
    const r = await rmsPowerReport(env(), '2026-11-21', '2026-11-21', now);
    expect(r.totals.rms).toMatchObject({ totalKwh: 150, rmsKwh: 125, crusherKwh: null, pf: null });
    expect(r.totals.kwh).toBe(125);
  });

  test('an old-form entry is the VCB-1 reading it is — counted, never called RMS power, its power factor from kWh ÷ kVAh', async () => {
    ROWS = [old, day1] as unknown as typeof ROWS;
    const r = await rmsPowerReport(env(), '2026-11-19', '2026-11-20', now);
    expect(r.days[0].rms).toMatchObject({ vcb1Kwh: 12162, vcb2Kwh: null, totalKwh: 12162, rmsKwh: null, meterOnlyKwh: 12162, hsmShareKwh: null, pf1: 0.911, pf: 0.911 });
    expect(r.totals).toMatchObject({ kwh: 28462 });
    expect(r.totals.rms).toMatchObject({ totalKwh: 32162, rmsKwh: 16300, meterOnlyKwh: 12162, vcb1Kwh: 24162, pf1: 0.917 });
  });
});
