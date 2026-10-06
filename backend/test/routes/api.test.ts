/**
 * The HTTP surface, through the real app (plugins, error handler, CORS) with `inject()` —
 * no network, no plant access. Data routes are exercised only on their validation paths,
 * which fail before any source is queried.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { loadServerConfig } from '../../src/config/server';

const FRONTEND = 'https://hsm.example.com';
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ config: loadServerConfig({ LOG_LEVEL: 'silent', CORS_ORIGINS: FRONTEND }) });
});
afterAll(() => app.close());

const get = async (url: string, headers: Record<string, string> = {}) => {
  const res = await app.inject({ method: 'GET', url, headers });
  return { status: res.statusCode, body: res.json(), headers: res.headers };
};

describe('service endpoints', () => {
  test('health, ready and config answer without touching a plant system', async () => {
    expect(await get('/api/health')).toMatchObject({ status: 200, body: { ok: true } });
    expect(await get('/api/ready')).toMatchObject({ status: 200, body: { ready: true } });
    expect((await get('/api/config')).body).toEqual({ poll_interval_seconds: expect.any(Number) });
  });

  test('readiness turns 503 while shutting down', async () => {
    const lifecycle = { shuttingDown: true };
    const draining = await buildApp({ config: loadServerConfig({ LOG_LEVEL: 'silent' }), lifecycle });
    const res = await draining.inject({ method: 'GET', url: '/api/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ ready: false });
    await draining.close();
  });

  test('an unknown path is a named 404', async () => {
    expect(await get('/api/nope')).toEqual(expect.objectContaining({ status: 404, body: { error: 'not_found', message: 'No such endpoint' } }));
  });

  test('every response is uncacheable and carries a request id', async () => {
    const r = await get('/api/health', { 'x-request-id': 'abc-123' });
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['x-request-id']).toBe('abc-123');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('CORS', () => {
  test('the configured frontend origin is allowed', async () => {
    const r = await get('/api/health', { origin: FRONTEND });
    expect(r.headers['access-control-allow-origin']).toBe(FRONTEND);
  });

  test('any other origin gets no CORS grant', async () => {
    const r = await get('/api/health', { origin: 'https://evil.example.com' });
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('a preflight for the SSO POST is answered', async () => {
    const res = await app.inject({
      method: 'OPTIONS', url: '/api/logbook-sso',
      headers: { origin: FRONTEND, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(FRONTEND);
  });
});

describe('HSM range routes reject bad input with a named error', () => {
  const RANGE = ['production', 'billets', 'yield', 'running-rate', 'logsheet', 'sizes', 'orders'];
  const GRAINED = ['production', 'billets', 'yield', 'running-rate', 'logsheet', 'orders'];

  test.each(RANGE)('/api/hsm/%s', async (route) => {
    expect(await get(`/api/hsm/${route}?from=2026-09-30&to=2026-09-21`)).toMatchObject({ status: 400, body: { error: 'bad_range' } });
    expect(await get(`/api/hsm/${route}?from=x&to=2026-09-21`)).toMatchObject({ status: 400, body: { error: 'bad_range' } });
    expect(await get(`/api/hsm/${route}?from=2024-01-01&to=2026-09-21`)).toMatchObject({ status: 400, body: { error: 'range_too_long' } });
  });

  test.each(GRAINED)('/api/hsm/%s grain', async (route) => {
    expect(await get(`/api/hsm/${route}?from=2026-09-21&to=2026-09-22&grain=hour`)).toMatchObject({ status: 400, body: { error: 'bad_grain' } });
  });

  test('/api/hsm/stock needs a date', async () => {
    expect(await get('/api/hsm/stock?to=yesterday')).toMatchObject({ status: 400, body: { error: 'bad_range' } });
  });

  test('the stand trend accepts only known groups, readings and windows', async () => {
    expect(await get('/api/hsm/stands?group=intermediate')).toMatchObject({ status: 400, body: { error: 'bad_group' } });
    expect(await get('/api/hsm/stands?group=roughing&metric=temperature')).toMatchObject({ status: 400, body: { error: 'bad_metric' } });
    expect(await get('/api/hsm/stands?group=roughing&hours=5')).toMatchObject({ status: 400, body: { error: 'bad_hours' } });
  });
});

describe('logbook SSO', () => {
  test('a missing token is a named 400, not a stack trace', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/logbook-sso', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'missing_token', message: 'An access token is required' });
  });

  test('a malformed body is a generic 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/logbook-sso', headers: { 'content-type': 'application/json' }, payload: '{nope' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'bad_request', message: 'The request is malformed' });
  });
});

describe('configuration', () => {
  test('a bad setting stops startup with the variable named', () => {
    expect(() => loadServerConfig({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadServerConfig({ NODE_ENV: 'production', CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/);
  });

  test('CORS_ORIGINS is a comma-separated list', () => {
    expect(loadServerConfig({ CORS_ORIGINS: 'https://a.com, https://b.com' }).CORS_ORIGINS).toEqual(['https://a.com', 'https://b.com']);
  });
});
