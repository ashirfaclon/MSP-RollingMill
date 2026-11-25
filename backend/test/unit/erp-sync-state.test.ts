/**
 * The Sync ERP button's backend (25 Nov 2026): ERP PM one file per mill (the old one-file cache read
 * until the first per-mill sync), and each mill's last fetch = the oldest of its own files.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Env } from '../../src/config/env';
import { erpMillSyncedAt, readErpPm } from '../../src/integrations/erp/cache';
import { pmReport } from '../../src/modules/pm/pm.service';

let dir: string;
const env = () => ({
  influxUrl: null, influxOrg: null, influxBucket: null, influxToken: null, influxUser: null, influxPassword: null,
  emsInfluxUrl: null, emsInfluxOrg: null, emsInfluxBucket: 'EMS Data', emsInfluxToken: null,
  erpDsn: null, erpUser: null, erpPassword: null, erpOracleClientDir: null, erpCacheDir: dir,
  iosenseBearer: null, iosenseBase: 'http://127.0.0.1:9', iosenseOrg: 'https://iosense.io', logbookInsightId: null,
  pollIntervalSeconds: 60,
}) as Env;
const put = (name: string, data: unknown) => writeFileSync(path.join(dir, name), JSON.stringify(data));

beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'erp-sync-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const LEGACY = {
  syncedAt: '2026-11-25T09:00:00.000Z', source: 'x',
  equipment: { hsm: 233, rmd: 1591, lsm: 846, rms: 1210 },
  days: [{ mill: 'rmd', date: '2026-11-20', due: 4, done: 3, doneOnTime: 2 }, { mill: 'lsm', date: '2026-11-20', due: 9, done: 9, doneOnTime: 9 }],
  breakdowns: [{ mill: 'rmd', vrno: 'B1', equipment: 'Pump', from: '2026-11-20T10:00', to: '2026-11-20T12:00', hours: 2, remark: null, closed: true }],
  workOrders: [{ mill: 'lsm', vrno: 'W1', date: '2026-11-19', equipment: 'Fan', closed: false, cancelled: false }],
};

describe('ERP PM, one file per mill', () => {
  test('a mill reads its own file', () => {
    put('erp-pm-rmd.json', { mill: 'rmd', syncedAt: '2026-11-25T12:00:00.000Z', source: 'x', equipment: 1591, days: [], breakdowns: [], workOrders: [] });
    put('erp-pm.json', LEGACY);
    expect(readErpPm(env(), 'rmd')).toMatchObject({ mill: 'rmd', equipment: 1591, syncedAt: '2026-11-25T12:00:00.000Z', days: [] });
  });

  test('until the first per-mill sync: only that mill\'s rows of the old file, untagged', () => {
    put('erp-pm.json', LEGACY);
    const rmd = readErpPm(env(), 'rmd')!;
    expect(rmd.equipment).toBe(1591);
    expect(rmd.days).toEqual([{ date: '2026-11-20', due: 4, done: 3, doneOnTime: 2 }]);
    expect(rmd.breakdowns.map((b) => b.vrno)).toEqual(['B1']);
    expect(rmd.workOrders).toEqual([]);
    expect(readErpPm(env(), 'lsm')!.workOrders.map((w) => w.vrno)).toEqual(['W1']);
  });

  test('the PM report shows only its mill', () => {
    put('erp-pm-rmd.json', { mill: 'rmd', syncedAt: 'x', source: 'x', equipment: 7, days: LEGACY.days.slice(0, 1).map(({ mill: _, ...d }) => d), breakdowns: [], workOrders: [] });
    const r = pmReport(env(), 'rmd', '2026-11-01', '2026-11-24', '2026-11-25');
    expect(r.equipment).toBe(7);
    expect(r.pm).toMatchObject({ due: 4, done: 3, doneOnTime: 2 });
    expect(pmReport(env(), 'lsm', '2026-11-01', '2026-11-24', '2026-11-25').erp.connection).toBe('down');
  });
});

describe("each mill's last fetch", () => {
  test('the oldest of its files; null while one is missing', () => {
    const at = (t: string) => ({ syncedAt: t });
    put('erp-rmd-production.json', at('2026-11-25T12:19:24.000Z'));
    put('erp-rmd-stock.json', at('2026-11-25T12:19:25.000Z'));
    put('erp-pm-rmd.json', { ...at('2026-11-25T08:00:00.000Z'), mill: 'rmd' });
    put('erp-lsm-production.json', at('2026-11-25T12:19:25.000Z'));
    const t = erpMillSyncedAt(env());
    expect(t.rmd).toBe('2026-11-25T08:00:00.000Z');
    expect(t.lsm).toBeNull();
    expect(t.hsm).toBeNull();
  });
});
