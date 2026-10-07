/**
 * The HTTP surface, through the real app (plugins, error handler, CORS) with `inject()` —
 * no network, no plant access. Data routes are exercised only on their validation paths,
 * which fail before any source is queried.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer, type Server } from 'node:http';
import { buildApp } from '../../src/app';
import { loadServerConfig } from '../../src/config/server';

const FRONTEND = 'https://hsm.example.com';
const SECRET = 'test-secret-test-secret-test-secret-0123';
let app: FastifyInstance;
let session: string;

beforeAll(async () => {
  app = await buildApp({ config: loadServerConfig({ LOG_LEVEL: 'silent', CORS_ORIGINS: FRONTEND, SESSION_SECRET: SECRET }) });
  session = app.jwt.sign({ sub: 'user-1', org: 'org-1' });
});
afterAll(() => app.close());

/** A signed-in GET (pass `authorization: ''` to go without a session). */
const get = async (url: string, headers: Record<string, string> = {}) => {
  const h = { authorization: `Bearer ${session}`, ...headers };
  if (!h.authorization) delete (h as Record<string, string>).authorization;
  const res = await app.inject({ method: 'GET', url, headers: h });
  return { status: res.statusCode, body: res.json(), headers: res.headers };
};

describe('service endpoints', () => {
  test('health, ready and config answer without touching a plant system', async () => {
    expect(await get('/api/health', { authorization: '' })).toMatchObject({ status: 200, body: { ok: true } });
    expect(await get('/api/health')).toMatchObject({ status: 200, body: { ok: true } });
    expect(await get('/api/ready')).toMatchObject({ status: 200, body: { ready: true } });
    expect((await get('/api/config')).body).toEqual({ poll_interval_seconds: expect.any(Number) });
  });

  test('readiness turns 503 while shutting down', async () => {
    const lifecycle = { shuttingDown: true };
    const draining = await buildApp({ config: loadServerConfig({ LOG_LEVEL: 'silent', SESSION_SECRET: SECRET }), lifecycle });
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

  test('a preflight for the sign-in POST is answered, and data calls may send the session', async () => {
    const res = await app.inject({
      method: 'OPTIONS', url: '/api/auth/sso',
      headers: { origin: FRONTEND, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(FRONTEND);
    const pre = await app.inject({
      method: 'OPTIONS', url: '/api/hsm/live',
      headers: { origin: FRONTEND, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' },
    });
    expect(pre.statusCode).toBe(204);
    expect(String(pre.headers['access-control-allow-headers']).toLowerCase()).toContain('authorization');
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

describe('access: only through an IOsense session', () => {
  test('data and status routes refuse a caller without a session', async () => {
    for (const url of ['/api/hsm/live', '/api/hsm/production?from=2026-09-22&to=2026-09-28', '/api/config', '/api/sources', '/api/erp']) {
      expect(await get(url, { authorization: '' })).toMatchObject({ status: 401, body: { error: 'unauthenticated' } });
    }
  });

  test('a forged, tampered or expired session is refused', async () => {
    const forged = await buildApp({ config: loadServerConfig({ LOG_LEVEL: 'silent', SESSION_SECRET: 'x'.repeat(40) }) });
    const other = forged.jwt.sign({ sub: 'u', org: 'o' });
    await forged.close();
    expect(await get('/api/hsm/live', { authorization: `Bearer ${other}` })).toMatchObject({ status: 401 });
    expect(await get('/api/hsm/live', { authorization: `Bearer ${session.slice(0, -2)}xx` })).toMatchObject({ status: 401 });
    const expired = app.jwt.sign({ sub: 'u', org: 'o' }, { expiresIn: -10 });
    expect(await get('/api/hsm/live', { authorization: `Bearer ${expired}` })).toMatchObject({ status: 401 });
  });

  test('the session endpoint says who is signed in, and refuses without one', async () => {
    expect(await get('/api/auth/session')).toMatchObject({ status: 200, body: { authenticated: true, authRequired: true, user: { userId: 'user-1', organisation: 'org-1' } } });
    expect(await get('/api/auth/session', { authorization: '' })).toMatchObject({ status: 401, body: { error: 'unauthenticated' } });
  });

  test('with sign-in disabled (local development) everything is open', async () => {
    const open = await buildApp({ config: loadServerConfig({ LOG_LEVEL: 'silent', AUTH_DISABLED: 'true' }) });
    expect((await open.inject({ method: 'GET', url: '/api/auth/session' })).json()).toMatchObject({ authRequired: false });
    expect((await open.inject({ method: 'GET', url: '/api/hsm/stock?to=x' })).statusCode).toBe(400);   // reached the route
    await open.close();
  });
});

describe('sign-in with the IOsense SSO token', () => {
  /** A stand-in for IOsense's validateSSOToken: GOOD is accepted once, anything else refused. */
  let iosense: Server;
  let calls: string[] = [];
  const saved = process.env.IOSENSE_BASE;
  beforeAll(async () => {
    const used = new Set<string>();
    iosense = createServer((req, res) => {
      const token = decodeURIComponent((req.url ?? '').split('/').pop() ?? '');
      calls.push(token);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const ok = (token === 'GOOD' || token === 'OTHER-ORG') && !used.has(token);
      used.add(token);
      res.end(JSON.stringify(ok
        ? { success: true, token: 'Bearer iosense-jwt', userId: 'u-42', organisation: token === 'GOOD' ? 'org-msp' : 'org-x' }
        : { success: false, errors: ['Invalid token'] }));
    });
    await new Promise<void>((r) => iosense.listen(0, '127.0.0.1', r));
    process.env.IOSENSE_BASE = `http://127.0.0.1:${(iosense.address() as { port: number }).port}`;
  });
  afterAll(() => { process.env.IOSENSE_BASE = saved; iosense.close(); });
  const sso = (payload: unknown, a = app) => a.inject({ method: 'POST', url: '/api/auth/sso', payload: payload as object });

  test('a valid token becomes a session that opens the data routes', async () => {
    const res = await sso({ token: 'GOOD' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ user: { userId: 'u-42', organisation: 'org-msp' }, expiresAt: expect.any(String) });
    expect(Date.parse(body.expiresAt) - Date.now()).toBeGreaterThan(11.9 * 3_600_000);   // 12 h by default
    expect(JSON.stringify(body)).not.toContain('iosense-jwt');                             // IOsense's JWT never reaches the browser
    const r = await get('/api/hsm/stock?to=x', { authorization: `Bearer ${body.sessionToken}` });
    expect(r.status).toBe(400);                                                            // past the gate, into the route
  });

  test('the token works once only — a reused link is refused, not retried', async () => {
    calls = [];
    expect((await sso({ token: 'GOOD' })).json()).toMatchObject({ error: 'sso_rejected' });
    expect(calls).toEqual(['GOOD']);
  });

  test('a missing or malformed token is a named 400', async () => {
    expect((await sso({})).json()).toEqual({ error: 'missing_token', message: 'A sign-in link from IOsense is required' });
    const res = await app.inject({ method: 'POST', url: '/api/auth/sso', headers: { 'content-type': 'application/json' }, payload: '{nope' });
    expect(res.json()).toEqual({ error: 'bad_request', message: 'The request is malformed' });
  });

  test('only the allowed organisations get in', async () => {
    const strict = await buildApp({ config: loadServerConfig({ LOG_LEVEL: 'silent', SESSION_SECRET: SECRET, AUTH_ALLOWED_ORGANISATIONS: 'org-msp' }) });
    const res = await sso({ token: 'OTHER-ORG' }, strict);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'forbidden_organisation' });
    await strict.close();
  });

  test('IOsense unreachable is a 503, not "link used"', async () => {
    process.env.IOSENSE_BASE = 'http://127.0.0.1:9';
    expect((await sso({ token: 'ANY' })).json()).toMatchObject({ error: 'sso_unavailable' });
    process.env.IOSENSE_BASE = `http://127.0.0.1:${(iosense.address() as { port: number }).port}`;
  });
});

describe('configuration', () => {
  test('a bad setting stops startup with the variable named', () => {
    expect(() => loadServerConfig({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadServerConfig({ NODE_ENV: 'production', CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/);
    expect(() => loadServerConfig({ NODE_ENV: 'production', AUTH_DISABLED: 'true' })).toThrow(/AUTH_DISABLED/);
    expect(() => loadServerConfig({ SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
    expect(loadServerConfig({ SESSION_SECRET: '' }).SESSION_SECRET).toBeUndefined();
  });

  test('CORS_ORIGINS is a comma-separated list', () => {
    expect(loadServerConfig({ CORS_ORIGINS: 'https://a.com, https://b.com' }).CORS_ORIGINS).toEqual(['https://a.com', 'https://b.com']);
  });
});
