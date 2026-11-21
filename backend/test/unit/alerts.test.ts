/** Alerts: the one checker, the alert settings' layers and checks, and the live list (SETTINGS_AND_ALERTS_REPLICATION.md §4–§7). */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Env } from '../../src/config/env';
import { LIMIT_MILLS } from '../../src/config/limits';
import { resetLogbookSession } from '../../src/integrations/logbook/client';
import { criticalOf, limitsOf, loadSettings, resetSettings, type SettingsDoc } from '../../src/modules/settings/settings.store';
import { crossings, ESCALATE_DAYS, marginOf } from '../../src/modules/alerts/engine';
import { alertSection, applyLayer, checkAlertPatch, resolveRule, SHIPPED } from '../../src/modules/alerts/controls';
import { alarmsOf, ruleIdsOf, saveAlertSettings } from '../../src/modules/alerts/alerts.service';
import { driveOf, type Reading, type Source } from '../../src/modules/alerts/readings';

const empty: SettingsDoc = { version: 1, updatedAt: null, updatedBy: null, limits: {} };
const band = (min: number | null, max: number | null) => ({ min, max, critical: criticalOf(min, max) });
const ctl = { onDelayReadings: 1, deadband: SHIPPED.deadband };
const pts = (...vs: number[]) => vs.map((value, i) => {
  const day = `2026-11-${String(i + 1).padStart(2, '0')}`;
  return { value, day, at: day };
});

describe('the checker', () => {
  test('no limit, no crossing', () => {
    expect(crossings(pts(90, 95), band(null, null), ctl)).toEqual([]);
    expect(crossings(pts(90, 95), null, ctl)).toEqual([]);
  });

  test('raises on the first reading past the limit, clears on the first back inside', () => {
    const xs = crossings(pts(70, 78, 80, 72, 70), band(null, 75), ctl);
    expect(xs).toHaveLength(1);
    expect(xs[0]).toMatchObject({ since: '2026-11-02', readings: 2, worst: 80, severity: 'warning', active: false, clearedAt: '2026-11-04' });
  });

  test('readings in a row: a single high reading does not raise', () => {
    expect(crossings(pts(70, 78, 70, 79, 80), band(null, 75), { ...ctl, onDelayReadings: 2 })).toEqual([
      expect.objectContaining({ since: '2026-11-04', readings: 2, active: true }),
    ]);
  });

  test('deadband: back inside but within the margin keeps it open', () => {
    // max 75, one-sided band 11.25, 10 % margin = 1.125: 74.5 is not yet normal, 73 is.
    const db = { ...ctl, deadband: { mode: 'pct-of-band' as const, value: 10 } };
    expect(marginOf(band(null, 75), db.deadband)).toBeCloseTo(1.125);
    const xs = crossings(pts(78, 74.5, 79, 73), band(null, 75), db);
    expect(xs).toHaveLength(1);
    expect(xs[0]).toMatchObject({ readings: 2, clearedAt: '2026-11-04' });
    // Without it, the same readings are two crossings.
    expect(crossings(pts(78, 74.5, 79, 73), band(null, 75), { ...ctl, deadband: { mode: 'absolute', value: 0 } })).toHaveLength(2);
  });

  test('critical: far past the limit, or past it a week running', () => {
    expect(crossings(pts(70, 87), band(null, 75), ctl)[0].severity).toBe('critical');
    expect(crossings(pts(2.0), band(2.5, null), ctl)[0].severity).toBe('critical');
    const week = Array.from({ length: ESCALATE_DAYS + 1 }, () => 76);
    const xs = crossings(pts(...week), band(null, 75), ctl);
    expect(xs[0]).toMatchObject({ severity: 'critical', readings: ESCALATE_DAYS + 1 });
    expect(crossings(pts(...week.slice(0, ESCALATE_DAYS)), band(null, 75), ctl)[0].severity).toBe('warning');
  });

  test('a below-min limit raises like an above-max one', () => {
    expect(crossings(pts(3.5, 2.4, 3.0), band(2.5, null), ctl)[0]).toMatchObject({ value: 2.4, active: false });
  });

  test('a drive is one series however its name was typed', () => {
    expect(['DRIVE03', 'DRIVE 3', 'Drive 03', ' drive 003 '].map(driveOf)).toEqual(Array(4).fill('Drive 03'));
    expect(driveOf('MAIN DRIVE')).toBe('MAIN DRIVE');
  });
});

describe('alert settings', () => {
  const doc = (alerts: unknown): SettingsDoc => ({ ...empty, alerts });

  test('each field: the rule\'s, else the mill\'s, else shipped', () => {
    const sec = alertSection(doc({ lsm: { defaults: { minSeverityToNotify: 'critical', enabled: false }, rules: { 'limit:flywheel-temp': { enabled: true, by: 'A', at: 'x' } } } }), 'lsm');
    const r = resolveRule(sec, 'limit:flywheel-temp');
    expect(r.controls).toMatchObject({ enabled: true, minSeverityToNotify: 'critical', onDelayReadings: 1 });
    expect(r.from).toMatchObject({ enabled: 'rule', minSeverityToNotify: 'mill', onDelayReadings: 'shipped' });
    expect(r.setBy).toBe('A');
    expect(resolveRule(sec, 'limit:oil-pressure').controls.enabled).toBe(false);
  });

  test('a form\'s days come with its rule; the mill\'s defaults can\'t set them', () => {
    const sec = alertSection(doc({ rmd: { defaults: { staleDays: 9 } } }), 'rmd');
    expect(resolveRule(sec, 'stale:oil-level', { staleDays: 20 }).controls.staleDays).toBe(20);
  });

  test('a stored value that is not valid falls through to the layer below', () => {
    // Data checks are never sent (the user, 21 Nov 2026): a stored "messages from data" is not valid.
    const sec = alertSection(doc({ lsm: { defaults: { onDelayReadings: 0, minSeverityToNotify: 'data', repeatHours: 4 } } }), 'lsm');
    expect(resolveRule(sec, 'limit:vibration').controls).toMatchObject({ onDelayReadings: 1, minSeverityToNotify: 'warning' });
    expect(resolveRule(sec, 'limit:vibration').controls).not.toHaveProperty('repeatHours');
  });

  test('a save is refused whole, with every problem', () => {
    const refs = new Map([['limit:vibration', { kind: 'limit' as const, label: 'Vibration' }], ['stale:mid', { kind: 'stale' as const, label: 'MID not filled' }]]);
    const { problems } = checkAlertPatch({
      defaults: { onDelayReadings: 12, staleDays: 3, deadband: { mode: 'absolute', value: 1 } },
      rules: { 'limit:vibration': { staleDays: 3, minSeverityToNotify: 'data' }, 'stale:mid': { deadband: { mode: 'pct-of-band', value: 5 } }, 'limit:nope': {} },
    }, refs);
    expect(problems).toEqual([
      'Mill defaults: readings in a row must be a whole number from 1 to 9',
      'Mill defaults: days without an entry does not apply here',
      'Mill defaults: a deadband as an amount is set on one alert (the units differ) — use a % for every alert',
      'Vibration: days without an entry does not apply here',
      'Vibration: messages are sent from critical or from warning up — data checks are never sent',
      'MID not filled: deadband does not apply here',
      'Unknown alert: limit:nope',
    ]);
    expect(checkAlertPatch({}, refs).problems).toEqual(['Nothing to save']);
  });

  test('null drops a setting; an emptied layer is gone', () => {
    const a = applyLayer({ enabled: false, onDelayReadings: 4, by: 'A', at: 't0' }, { enabled: null }, 'B', 't1');
    expect(a).toEqual({ next: { onDelayReadings: 4, by: 'B', at: 't1' }, changed: 1 });
    expect(applyLayer(a.next, null, 'B', 't2')).toEqual({ next: undefined, changed: 1 });
    expect(applyLayer({ onDelayReadings: 4, by: 'A', at: 't0' }, { onDelayReadings: 4 }, 'B', 't1')).toEqual({ next: { onDelayReadings: 4, by: 'A', at: 't0' }, changed: 0 });
  });

  test('every mill has a rule per limit, per form and one for typing slips', () => {
    for (const mill of LIMIT_MILLS) {
      const ids = ruleIdsOf(mill);
      expect(ids).toContain('limit:vibration');
      expect(ids).toContain('stale:mid');
      expect(ids).toContain('entry:slip');
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('the live list', () => {
  const r = (limitId: string, asset: string, point: string, value: number, day: string): Reading => ({ limitId, asset, point, value, day, at: day, source: 'drive-temp' });
  const fresh: Source = { key: 'drive-temp', label: 'LSM Mechanical → Drive Temp', ok: true, message: 'Read', lastDate: '2026-11-19', expectDays: 2 };
  const mid: Source = { key: 'mid', label: 'MID Logbook → Vibration Reading', ok: true, message: 'Read', lastDate: '2026-11-01', expectDays: 45 };
  const limits = limitsOf(empty, 'lsm');
  const sec = alertSection(empty, 'lsm');
  const got = (readings: Reading[], sources: Source[] = [fresh, mid]) => ({ readings, sources, today: '2026-11-19' });

  test('a reading past its limit: one row per point, worded as a message', () => {
    const a = alarmsOf('lsm', got([
      r('flywheel-temp', 'Drive 03', 'Flywheel DE', 70, '2026-11-17'),
      r('flywheel-temp', 'Drive 03', 'Flywheel DE', 78, '2026-11-18'),
      r('flywheel-temp', 'Drive 03', 'Flywheel DE', 79, '2026-11-19'),
      r('flywheel-temp', 'Drive 04', 'Flywheel DE', 60, '2026-11-19'),
    ]), limits, sec);
    expect(a).toEqual([expect.objectContaining({
      key: 'lsm|limit:flywheel-temp|Drive 03|Flywheel DE', episode: 'lsm|limit:flywheel-temp|Drive 03|Flywheel DE|2026-11-18',
      severity: 'warning', active: true, value: 79, worst: 79, readings: 2, limit: { min: null, max: 75 }, muted: false,
      message: 'Drive 03 · Flywheel DE: flywheel bearings 79 °C, above the max of 75 °C (since 18 Nov)',
    })]);
  });

  test('cleared: shown for a week, then gone', () => {
    const rows = (back: string) => alarmsOf('lsm', got([r('oil-pressure', 'Drive 01', 'Gearbox oil', 2.2, '2026-11-01'), r('oil-pressure', 'Drive 01', 'Gearbox oil', 4, back)]), limits, sec);
    expect(rows('2026-11-15')).toEqual([expect.objectContaining({ active: false, clearedAt: '2026-11-15', message: 'Drive 01 · Gearbox oil: gearbox oil pressure back inside on 15 Nov (worst 2.2 kg/cm²)' })]);
    expect(rows('2026-11-10')).toEqual([]);
  });

  test('a typing slip is a data check, not a process alarm', () => {
    const a = alarmsOf('lsm', got([r('gearbox-bearing-temp', 'Drive 05', 'Pinion DE', 4.08, '2026-11-14')]), limits, sec);
    expect(a).toEqual([expect.objectContaining({ ruleId: 'entry:slip', severity: 'data', limit: null, value: 4.08 })]);
    expect(a[0].message).toMatch(/filed as 4\.08 °C on 14 Nov — can't be real \(5–150\); check the entry/);
  });

  test('a form not filled, or that can\'t be read, is a data check', () => {
    const a = alarmsOf('lsm', got([], [{ ...fresh, lastDate: '2026-11-15' }, { ...mid, ok: false, message: 'down' }]), limits, sec);
    expect(a.map((x) => [x.ruleId, x.kind, x.severity, x.message])).toEqual([
      ['stale:drive-temp', 'stale', 'data', 'LSM Mechanical → Drive Temp: no entry for 4 days (last 15 Nov)'],
      ['stale:mid', 'source', 'data', 'MID Logbook → Vibration Reading can\'t be read: down'],
    ]);
  });

  test('switched off: still listed, muted; a pinned severity wins', () => {
    const tuned = alertSection({ ...empty, alerts: { lsm: { rules: { 'limit:flywheel-temp': { enabled: false, severityOverride: 'critical' } } } } }, 'lsm');
    const [a] = alarmsOf('lsm', got([r('flywheel-temp', 'Drive 03', 'Flywheel DE', 78, '2026-11-19')]), limits, tuned);
    expect(a).toMatchObject({ muted: true, severity: 'critical', severityPinned: true });
  });

  test('order: data, then critical, then warning', () => {
    const a = alarmsOf('lsm', got([
      r('flywheel-temp', 'Drive 01', 'Flywheel DE', 77, '2026-11-19'),
      r('flywheel-temp', 'Drive 02', 'Flywheel DE', 90, '2026-11-19'),
    ], [{ ...fresh, lastDate: '2026-11-10' }, mid]), limits, sec);
    expect(a.map((x) => x.severity)).toEqual(['data', 'critical', 'warning']);
  });
});

describe('saving alert settings', () => {
  const TAG = 'rolling-mill-settings/settings';
  const env = { iosenseBearer: 'Bearer t', iosenseBase: 'https://connector.test', iosenseOrg: 'https://iosense.test', logbookInsightId: 'INS_test' } as unknown as Env;
  function fakeStore(rows: { result: unknown; createdAt: string }[]) {
    const added: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body ?? '{}');
      if (url.includes('/fetch/paginated/')) {
        const data = rows.map((x) => ({ ...x, tags: [TAG], resultName: TAG }));
        return new Response(JSON.stringify({ success: true, data: { data, totalCount: data.length } }));
      }
      if (url.endsWith('/insightResult/add')) {
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

  test('saved into the same document as the limits, the limits carried forward; reset prunes it', async () => {
    const limits = { lsm: { 'flywheel-temp': { min: null, max: 70, by: 'A', at: '2026-11-18T00:00:00.000Z' } } };
    const added = fakeStore([{ result: { version: 1, updatedAt: '2026-11-18T00:00:00.000Z', updatedBy: 'A', limits }, createdAt: '2026-11-18T00:00:00.000Z' }]);
    const r = await saveAlertSettings(env, 'lsm', { by: 'Ravi', defaults: { minSeverityToNotify: 'critical' }, rules: { 'limit:vibration': { enabled: false } } }, 'user-1');
    expect(r).toMatchObject({ ok: true, changed: 2 });
    const doc = added[0].result as SettingsDoc;
    expect(doc.limits).toEqual(limits);
    expect(doc.alerts).toEqual({ lsm: {
      defaults: { minSeverityToNotify: 'critical', by: 'Ravi', at: r.updatedAt },
      rules: { 'limit:vibration': { enabled: false, by: 'Ravi', at: r.updatedAt } },
    } });
    // In use at once.
    expect(alertSection(await loadSettings(env), 'lsm').rules?.['limit:vibration']?.enabled).toBe(false);

    const back = await saveAlertSettings(env, 'lsm', { by: 'Ravi', defaults: { minSeverityToNotify: null }, rules: { 'limit:vibration': null } }, 'user-1');
    expect(back.changed).toBe(2);
    expect((added[1].result as SettingsDoc).alerts).toBeUndefined();
    // Nothing different: nothing written.
    expect((await saveAlertSettings(env, 'lsm', { rules: { 'limit:vibration': null } }, 'user-1')).changed).toBe(0);
    expect(added).toHaveLength(2);
  });

  test('the contact list: saved whole, checked, kept when other settings are saved', async () => {
    const added = fakeStore([]);
    const level = { everyMinutes: 0, sms: { enabled: true, contacts: ['+91 98765-43210', '+919876543210'] }, whatsapp: { enabled: false, contacts: ['98765 43210'] }, email: { enabled: true, contacts: ['Shift.Engg@MSP.in'] } };
    const r = await saveAlertSettings(env, 'rmd', { by: 'Ravi', escalation: { onePerCrossing: true, levels: [level] } }, 'u');
    expect(r.changed).toBe(1);
    const saved = (added[0].result as { alerts: Record<string, { escalation: unknown }> }).alerts.rmd.escalation;
    expect(saved).toEqual({
      onePerCrossing: true,
      levels: [{ everyMinutes: 0, sms: { enabled: true, contacts: ['+919876543210'] }, whatsapp: { enabled: false, contacts: ['9876543210'] }, email: { enabled: true, contacts: ['shift.engg@msp.in'] } }],
      by: 'Ravi', at: r.updatedAt,
    });
    expect(alertSection(await loadSettings(env), 'rmd').escalation).toMatchObject({ onePerCrossing: true, setBy: 'Ravi', levels: [expect.objectContaining({ everyMinutes: 0 })] });
    // A tuning save carries the contact list forward; the same list again changes nothing.
    await saveAlertSettings(env, 'rmd', { by: 'Ravi', defaults: { onDelayReadings: 2 } }, 'u');
    expect((added[1].result as { alerts: Record<string, { escalation: unknown }> }).alerts.rmd.escalation).toEqual(saved);
    expect((await saveAlertSettings(env, 'rmd', { by: 'Ravi', escalation: { onePerCrossing: true, levels: [level] } }, 'u')).changed).toBe(0);
    // Refused whole: a channel on with nobody, a bad number, a bad interval.
    await expect(saveAlertSettings(env, 'rmd', { by: 'Ravi', escalation: { onePerCrossing: false, levels: [
      { ...level, everyMinutes: 1.5, sms: { enabled: true, contacts: ['12ab'] }, email: { enabled: true, contacts: [] } },
    ] } }, 'u')).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/Level 1: every must be whole minutes.*"12ab" is not a phone number.*Level 1 SMS is on with nobody on it.*Level 1 Email is on with nobody on it/) });
    expect(added).toHaveLength(2);
  });

  test('a refused save writes nothing', async () => {
    const added = fakeStore([]);
    await expect(saveAlertSettings(env, 'rms', { rules: { 'limit:oil-temp': { onDelayReadings: 0 } } }, 'u')).rejects.toMatchObject({ status: 400, code: 'bad_alert_settings' });
    expect(added).toHaveLength(0);
  });
});
