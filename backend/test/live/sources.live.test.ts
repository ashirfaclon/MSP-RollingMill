/**
 * Backend connectivity — LIVE, against the real plant systems. Needs backend/.env
 * (gitignored) and network access to the plant; every suite skips itself otherwise.
 *
 * These exercise the real read paths end to end, not just the probes: a windowed read, a
 * latest read and a raw read on a real HSM field; a raw EMS read; a read-only ERP sync.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../../src/config/env';
import { loadServerConfig } from '../../src/config/server';
import { buildApp } from '../../src/app';
import { MSG } from '../../src/shared/messages';
import { catalogue, fetchLatest, fetchRaw, fetchWindow, historianConfigured, probeHistorian } from '../../src/integrations/historian/client';
import { HSM_MEASUREMENT, type TagDef } from '../../src/integrations/historian/tags';
import { emsConfigured, fetchEmsRaw, probeEms } from '../../src/integrations/ems/client';
import { erpStatus } from '../../src/integrations/erp/cache';
import { probeLogbook, resetLogbookSession } from '../../src/integrations/logbook/client';

const ENV_FILE = path.resolve(process.cwd(), '.env');
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
const env = loadEnv();


describe.skipIf(!historianConfigured(env))('process historian (live)', () => {

  test('connects, lists HSM, and HSM is writing now', async () => {
    const p = await probeHistorian(env, HSM_MEASUREMENT);
    expect(p).toMatchObject({ connection: 'up', configured: true });
    expect(p.measurements).toContain(HSM_MEASUREMENT);
    expect(p.fresh, `HSM last wrote at ${p.lastReadingAt && new Date(p.lastReadingAt).toISOString()}`).toBe(true);
  });

  test('a real HSM field reads through window, latest and raw', async () => {
    const cat = await catalogue(env, HSM_MEASUREMENT);
    expect(cat.connection).toBe('up');
    expect(cat.units.length).toBeGreaterThan(0);
    expect(cat.fields.length).toBeGreaterThan(0);
    console.info(`HSM catalogue: ${cat.units.length} units · ${cat.groups.length} groups · ${cat.fields.length} fields`);

    // Try fields until one has data in the last hour — the catalogue spans a day.
    const to = Date.now();
    const from = to - 3_600_000;
    let hit: { def: TagDef; n: number } | null = null;
    for (const field of cat.fields.slice(0, 25)) {
      const def: TagDef = {
        key: 'probe', label: field, measurement: HSM_MEASUREMENT, unitTag: cat.units[0],
        field, unit: '', scale: 1, mapped: true,
      };
      const w = await fetchWindow(env, from, to, [def]);
      expect(w.connection).toBe('up');
      if (w.series.probe.length > 0) { hit = { def, n: w.series.probe.length }; break; }
    }
    expect(hit, 'no HSM field had data in the last hour').not.toBeNull();
    expect(hit!.n).toBeLessThanOrEqual(61);   // 60 s buckets over an hour

    const latest = await fetchLatest(env, from, to, [hit!.def]);
    expect(latest.latest.probe).not.toBeNull();
    const raw = await fetchRaw(env, from, to, [hit!.def]);
    expect(raw.series.probe.length).toBeGreaterThanOrEqual(hit!.n);
  });
});

describe.skipIf(!emsConfigured(env))('electrical meters (live)', () => {

  test('connects, lists equipment, and says whether readings are current', async () => {
    const p = await probeEms(env);
    expect(p).toMatchObject({ connection: 'up', configured: true });
    expect(p.equipment.length).toBeGreaterThan(0);
    expect(p.message).toBe(p.fresh ? MSG.EMS_UP : MSG.EMS_STALE);
    console.info('EMS last reading:', p.lastReadingAt ? new Date(p.lastReadingAt).toISOString() : 'none in 30 days');

    // A raw read of a real feeder, over the last day that had readings.
    const end = p.lastReadingAt ?? Date.now();
    const w = await fetchEmsRaw(env, end - 86_400_000, end + 1, [
      { key: 'f', name: p.equipment[0], label: p.equipment[0], mapped: true },
    ]);
    expect(w.connection).toBe('up');
    expect(w.series.f.length).toBeGreaterThan(0);
  });
});

describe.skipIf(!loadEnv().erpDsn)('ERP (live)', () => {

  test('a read-only sync succeeds and the app reads it from the cache', () => {
    execFileSync('npm', ['run', '-s', 'sync:erp'], { cwd: process.cwd(), stdio: 'pipe', timeout: 110_000 });
    const s = erpStatus(env);
    expect(s).toMatchObject({ connection: 'up', message: MSG.ERP_UP, lastAttempt: { ok: true } });
    expect(s.ageMinutes).toBeLessThanOrEqual(1);
    expect(s.divisions.length).toBeGreaterThan(0);
    expect(s.divisions.every((d) => d.entity === 'MP' || d.entity === 'MS')).toBe(true);
  });
});

describe.skipIf(!env.iosenseBearer)('logbook (live)', () => {

  test('the configured session is accepted', async () => {
    resetLogbookSession();
    const p = await probeLogbook(env);
    expect(p).toMatchObject({ connection: 'up', configured: true });
  });
});

describe.skipIf(!historianConfigured(env))('API (live, through the app)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ config: loadServerConfig({ LOG_LEVEL: 'silent', AUTH_DISABLED: 'true' }) }); });
  afterAll(() => app.close());
  const get = (url: string) => app.inject({ method: 'GET', url });

  test('/api/sources reports all four, each actually exercised', async () => {
    const res = await get('/api/sources?refresh=1');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sources.map((s: { id: string }) => s.id)).toEqual(['historian', 'ems', 'erp', 'logbook']);
    const byId = Object.fromEntries(body.sources.map((s: { id: string }) => [s.id, s]));
    expect(byId.historian).toMatchObject({ connection: 'up', fresh: true });
    expect(byId.ems.connection).toBe('up');
    expect(byId.logbook.connection).toBe('up');
    // No credential or host ever appears in the payload.
    expect(JSON.stringify(body)).not.toMatch(/token|password|:\/\/|8086|\d+\.\d+\.\d+\.\d+/i);
  });

  test('catalogue answers for HSM and refuses a measurement the historian never listed', async () => {
    const ok = await get(`/api/historian/catalogue?measurement=${HSM_MEASUREMENT}`);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().fields.length).toBeGreaterThan(0);

    const bad = await get(`/api/historian/catalogue?measurement=${encodeURIComponent('HSM") |> drop(')}`);
    expect(bad.statusCode).toBe(404);
    expect(bad.json()).toMatchObject({ error: 'unknown_measurement' });
  });

  test('health and config answer', async () => {
    expect((await get('/api/health')).json().ok).toBe(true);
    expect((await get('/api/config')).json().poll_interval_seconds).toBe(60);
  });
});
