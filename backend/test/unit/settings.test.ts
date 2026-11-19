/** Plant settings: defaults, edits over them, and the shared store (SETTINGS_AND_ALERTS_REPLICATION.md §3). */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Env } from '../../src/config/env';
import { LIMIT_DEFAULTS, LIMIT_MILLS } from '../../src/config/limits';
import { resetLogbookSession } from '../../src/integrations/logbook/client';
import {
  checkPatch, coerce, criticalOf, judge, limitsOf, loadSettings, millSettings, newestDoc, resetSettings, saveMillSettings, type SettingsDoc,
} from '../../src/modules/settings/settings.store';

const TAG = 'rolling-mill-settings/settings';
const empty: SettingsDoc = { version: 1, updatedAt: null, updatedBy: null, limits: {} };
const env = { iosenseBearer: 'Bearer t', iosenseBase: 'https://connector.test', iosenseOrg: 'https://iosense.test', logbookInsightId: 'INS_test' } as unknown as Env;
const noStore = { iosenseBearer: null, logbookInsightId: null } as unknown as Env;

/** A fake insight: `rows` are what a read returns; every add is recorded (and becomes a row). */
function fakeStore(rows: { result: unknown; createdAt: string }[], opts: { readFails?: boolean; addFails?: boolean } = {}) {
  const added: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { method: string; body: string }) => {
    const body = JSON.parse(init.body ?? '{}');
    if (url.includes('/fetch/paginated/')) {
      if (opts.readFails) return new Response(JSON.stringify({ success: false, errors: 'down' }), { status: 500 });
      const data = rows.map((r) => ({ ...r, tags: [TAG], resultName: TAG }));
      return new Response(JSON.stringify({ success: true, data: { data, totalCount: data.length } }));
    }
    if (url.endsWith('/insightResult/add')) {
      if (opts.addFails) return new Response(JSON.stringify({ success: false, errors: 'refused' }), { status: 400 });
      added.push(body);
      rows.push({ result: body.result, createdAt: new Date().toISOString() });
      return new Response(JSON.stringify({ success: true }));
    }
    return new Response('{}', { status: 404 });
  }));
  return added;
}

beforeEach(() => { resetSettings(); resetLogbookSession(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('the shipped defaults', () => {
  test('every limit has a basis and a range its default sits in', () => {
    for (const mill of LIMIT_MILLS) {
      for (const d of LIMIT_DEFAULTS[mill]) {
        expect(d.basis.length).toBeGreaterThan(10);
        for (const v of [d.min, d.max]) if (v !== null) expect(v >= d.range[0] && v <= d.range[1]).toBe(true);
        expect(d.approval === 'none').toBe(d.min === null && d.max === null);
      }
    }
  });
  test('RMD keeps the plant\'s own limits; the rest are placeholders or empty', () => {
    const rmd = limitsOf(empty, 'rmd');
    expect(rmd.filter((l) => l.source === 'plant').map((l) => [l.id, l.min, l.max])).toEqual([
      ['bearing-temp', 45, 65], ['flywheel-temp', 45, 80], ['oil-tank-temp', 45, 65],
    ]);
    expect(limitsOf(empty, 'lsm').find((l) => l.id === 'motor-current')).toMatchObject({ source: 'none', min: null, max: null });
    for (const mill of LIMIT_MILLS) expect(limitsOf(empty, mill).find((l) => l.id === 'vibration')).toMatchObject({ max: 4.5, source: 'placeholder' });
  });
});

describe('judging a reading', () => {
  test('critical: one band width past a two-sided limit, 15 % past a one-sided one', () => {
    expect(criticalOf(45, 65)).toEqual({ below: 25, above: 85 });
    expect(criticalOf(null, 75)).toEqual({ below: null, above: 86.25 });
    expect(criticalOf(2.5, null)).toEqual({ below: 2.125, above: null });
  });
  test('inside, a warning, or critical — below or above', () => {
    const l = { min: null, max: 75, critical: criticalOf(null, 75) };
    expect(judge(75, l)).toEqual({ status: 'ok', severity: null });
    expect(judge(76, l)).toEqual({ status: 'high', severity: 'warning' });
    expect(judge(87, l)).toEqual({ status: 'high', severity: 'critical' });
    const p = { min: 2.5, max: null, critical: criticalOf(2.5, null) };
    expect(judge(2.2, p)).toEqual({ status: 'low', severity: 'warning' });
    expect(judge(1, p)).toEqual({ status: 'low', severity: 'critical' });
    expect(judge(50, { min: null, max: null, critical: { below: null, above: null } })).toBeNull();
  });
});

describe('the stored document', () => {
  test('accepted on version 1 alone; missing sections default; a newer build\'s section is kept', () => {
    expect(coerce({ version: 2, limits: {} })).toBeNull();
    expect(coerce({ version: 1 })).toMatchObject({ limits: {} });
    const d = coerce({ version: 1, alerts: { rmd: { defaults: { enabled: false } } }, limits: { lsm: { 'flywheel-temp': { max: 70, at: 'x' }, 'oil-level': {} } } });
    expect(d?.limits.lsm).toEqual({ 'flywheel-temp': { min: null, max: 70, by: null, at: 'x' } });
    expect(d?.alerts).toEqual({ rmd: { defaults: { enabled: false } } });
  });
  test('the newest row that is a document wins', () => {
    const doc = (max: number) => ({ version: 1, limits: { rms: { 'oil-temp': { max, at: '' } } } });
    const d = newestDoc([
      { result: doc(60), createdAt: '2026-11-18T10:00:00Z' },
      { result: { junk: true }, createdAt: '2026-11-19T10:00:00Z' },
      { result: doc(65), createdAt: '2026-11-19T09:00:00Z' },
    ] as never);
    expect(d?.limits.rms['oil-temp'].max).toBe(65);
  });
});

describe('an edit is checked whole before it is saved', () => {
  test('every problem at once, in words', () => {
    const { problems } = checkPatch('lsm', { limits: {
      nope: { min: 1, max: 2 },
      'flywheel-temp': { min: 80, max: 70 },
      'oil-level': { min: null, max: null },
      'oil-pressure': { min: 900, max: null },
    } });
    expect(problems).toEqual([
      'Unknown limit: nope',
      'Flywheel bearings: the minimum must be below the maximum',
      'Gearbox oil level: enter a minimum or a maximum, or reset it to its default',
      'Gearbox oil pressure: 900 kg/cm² is outside 0.1–50 kg/cm² — check the number',
    ]);
    expect(checkPatch('lsm', { limits: {} }).problems).toEqual(['Nothing to save']);
  });
  test('one side may be empty; null resets; values kept to the limit\'s decimals', () => {
    const { changes, problems } = checkPatch('rmd', { limits: { 'bearing-temp': { min: null, max: 70.4 }, 'chem-s': { min: null, max: 0.04549 }, 'flywheel-temp': null } });
    expect(problems).toEqual([]);
    expect([...changes]).toEqual([['bearing-temp', { min: null, max: 70 }], ['chem-s', { min: null, max: 0.045 }], ['flywheel-temp', null]]);
  });
});

describe('the shared store', () => {
  test('no IOsense: the defaults, said so, and saving is refused', async () => {
    const s = await millSettings(noStore, 'rms');
    expect(s.store.connection).toBe('down');
    expect(s.store.message).toMatch(/Showing the defaults/);
    expect(s.limits.find((l) => l.id === 'oil-temp')).toMatchObject({ max: 70, source: 'placeholder' });
    await expect(saveMillSettings(noStore, 'rms', { limits: { 'oil-temp': { min: null, max: 60 } } }, 'u')).rejects.toThrow(/Not saved/);
  });

  test('a save writes the whole document, newest wins, and is in use at once', async () => {
    const added = fakeStore([{ result: { version: 1, limits: { rmd: { 'bearing-temp': { min: 40, max: 70, at: 'a' } } }, alerts: { x: 1 } }, createdAt: '2026-11-18T00:00:00Z' }]);
    const r = await saveMillSettings(env, 'lsm', { by: ' Ramesh ', limits: { 'flywheel-temp': { min: null, max: 70 } } }, 'user-1');
    expect(r).toMatchObject({ ok: true, changed: 1 });
    expect(added).toHaveLength(1);
    const doc = added[0].result as SettingsDoc;
    // Spread first: the other mill's edit and the unknown section are carried forward.
    expect(doc.limits.rmd['bearing-temp']).toMatchObject({ min: 40, max: 70 });
    expect(doc.alerts).toEqual({ x: 1 });
    expect(doc.limits.lsm['flywheel-temp']).toMatchObject({ min: null, max: 70, by: 'Ramesh' });
    expect(added[0]).toMatchObject({ resultName: TAG, tags: [TAG], applicationType: 'Insight' });
    const s = await millSettings(env, 'lsm');
    expect(s.limits.find((l) => l.id === 'flywheel-temp')).toMatchObject({ max: 70, source: 'edited', setBy: 'Ramesh' });
    expect(s.store).toMatchObject({ connection: 'up', updatedBy: 'Ramesh' });
  });

  test('reset: the edit is dropped and an empty mill is pruned; no change: nothing written', async () => {
    const added = fakeStore([{ result: { version: 1, limits: { rms: { 'oil-temp': { max: 60, at: 'a' } } } }, createdAt: '2026-11-18T00:00:00Z' }]);
    expect(await saveMillSettings(env, 'rms', { limits: { 'oil-temp': { min: null, max: 60 } } }, 'u')).toMatchObject({ changed: 0 });
    expect(added).toHaveLength(0);
    await saveMillSettings(env, 'rms', { limits: { 'oil-temp': null } }, 'u');
    expect((added[0].result as SettingsDoc).limits).toEqual({});
    expect((await millSettings(env, 'rms')).limits.find((l) => l.id === 'oil-temp')).toMatchObject({ max: 70, source: 'placeholder' });
  });

  test('a read that fails after a good one keeps the edits in hand; a save is then refused', async () => {
    fakeStore([{ result: { version: 1, limits: { hsm: { 'motor-loading': { max: 110, at: 'a' } } } }, createdAt: '2026-11-18T00:00:00Z' }]);
    const t0 = Date.now();
    await loadSettings(env, true, t0);
    fakeStore([], { readFails: true });
    resetLogbookSession();
    const doc = await loadSettings(env, true, t0 + 200_000);
    expect(doc.limits.hsm['motor-loading'].max).toBe(110);
    await expect(saveMillSettings(env, 'hsm', { limits: { 'motor-loading': { min: null, max: 120 } } }, 'u')).rejects.toThrow(/can't be read/);
  });

  test('a refused write is said, and nothing changes here', async () => {
    fakeStore([], { addFails: true });
    await expect(saveMillSettings(env, 'rmd', { limits: { 'chem-c': { min: null, max: 0.3 } } }, 'u')).rejects.toThrow(/Not saved — The logbook refused/);
    expect((await millSettings(env, 'rmd')).limits.find((l) => l.id === 'chem-c')).toMatchObject({ max: 0.25, source: 'placeholder' });
  });
});
