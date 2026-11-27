/**
 * Sign-in from IOsense (the user, 27 Nov 2026): a person signing in never replaces the server's data session when
 * an access token is set in the environment — a sub-user with fewer IOsense permissions must not turn logbook
 * figures off for everyone. Their own session is used only to ask IOsense who they are (describeUser).
 * A stand-in IOsense answers the SSO exchange, my-permissions, fetchRole and the insight fetch.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { Env } from '../../src/config/env';
import { describeUser, exchangeSsoToken, fetchFormEntries, resetLogbookSession } from '../../src/integrations/logbook/client';

let server: Server;
let base = '';
/** The Authorization header of every insight read, in order. */
let insightAuth: string[] = [];
let subUser = true;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const url = req.url ?? '';
      const send = (j: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); };
      if (url.startsWith('/api/retrieve-sso-token/')) return send({ success: true, token: 'Bearer person-session', userId: 'u-hsm', organisation: 'org-1' });
      if (url === '/api/account/my-permissions') {
        expect(req.headers.authorization).toBe('Bearer person-session');
        return send({ success: true, data: subUser ? { isSubUser: true, roleID: 'role-hsm', permissions: {} } : { isSubUser: false } });
      }
      if (url.startsWith('/api/account/subuser/fetchRole/')) {
        return send({ success: true, data: { data: [{ _id: 'role-hsm', roleName: 'HSM', subUsers: ['a', 'b'] }, { _id: 'role-rmd', roleName: 'RMD', subUsers: [] }] } });
      }
      if (url.startsWith('/api/account/bruce/insightResult/fetch/paginated/')) {
        insightAuth.push(String(req.headers.authorization));
        return send({ success: true, data: { data: [], totalCount: 0 } });
      }
      res.writeHead(404); res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => server.close());
beforeEach(() => { resetLogbookSession(); insightAuth = []; subUser = true; });

const env = (patch: Partial<Env> = {}): Env => ({
  influxUrl: null, influxOrg: null, influxBucket: null, influxToken: null, influxUser: null, influxPassword: null,
  emsInfluxUrl: null, emsInfluxOrg: null, emsInfluxBucket: 'EMS Data', emsInfluxToken: null,
  erpDsn: null, erpUser: null, erpPassword: null, erpOracleClientDir: null, erpCacheDir: 'data-test-none',
  iosenseBearer: 'Bearer service', iosenseBase: base, iosenseOrg: 'https://iosense.io', logbookInsightId: 'INS_test',
  pollIntervalSeconds: 60, ...patch,
});

describe('sign-in keeps the data session', () => {
  test('with a token in the environment: data is read with it, before and after a person signs in', async () => {
    const e = env();
    await fetchFormEntries('form/a', 0, e);
    const r = await exchangeSsoToken('one-time', e);
    expect(r).toMatchObject({ ok: true, userBearer: 'Bearer person-session', user: { userId: 'u-hsm', organisation: 'org-1' } });
    await fetchFormEntries('form/b', 0, e);
    expect(insightAuth).toEqual(['Bearer service', 'Bearer service']);
  });

  test('with no token in the environment: the person\'s session becomes the data session, as before', async () => {
    const e = env({ iosenseBearer: null });
    await exchangeSsoToken('one-time', e);
    await fetchFormEntries('form/a', 0, e);
    expect(insightAuth).toEqual(['Bearer person-session']);
  });
});

describe('who signed in, from IOsense', () => {
  test('a sub-user: their role id', async () => {
    expect(await describeUser('Bearer person-session', env())).toEqual({ isSubUser: true, roleId: 'role-hsm' });
  });
  test('the main account: the account\'s roles, names and member counts', async () => {
    subUser = false;
    expect(await describeUser('Bearer person-session', env())).toEqual({
      isSubUser: false, roleId: null,
      roles: [{ id: 'role-hsm', name: 'HSM', members: 2 }, { id: 'role-rmd', name: 'RMD', members: 0 }],
    });
  });
  test('IOsense unreachable: described, never thrown', async () => {
    const d = await describeUser('Bearer x', env({ iosenseBase: 'http://127.0.0.1:9' }));
    expect(d).toMatchObject({ isSubUser: null, roleId: null });
    expect(d.error).toBeTruthy();
  });
});
