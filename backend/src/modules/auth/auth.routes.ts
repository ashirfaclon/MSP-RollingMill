/**
 * Sign-in, mounted at /api/auth:
 *   POST /sso      { token } — the IOsense SSO token from the app URL (functionID
 *                  validateSSOToken), exchanged once for an app session; the person's IOsense role decides which
 *                  mills the session may see (the user, 27 Nov 2026 — modules/auth/access.ts)
 *   GET  /session  is the caller's session valid? Asks IOsense for the role again, so a change takes effect when the
 *                  dashboard is opened or refreshed (also tells the frontend when sign-in is off)
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { SessionResponse, SsoExchangeResponse } from '../../contracts';
import type { ServerConfig } from '../../config/server';
import { exchangeSsoToken } from '../../integrations/logbook/client';
import type { SessionClaims } from '../../plugins/auth';
import { HttpError } from '../../shared/http-error';
import { MSG } from '../../shared/messages';
import { AccessUnavailable, bearerOf, keepBearer, resolveAccess, type Access } from './access';

const sameMills = (a: readonly string[] | undefined, b: readonly string[]) =>
  !!a && a.length === b.length && a.every((m) => b.includes(m));

export async function authRoutes(app: FastifyInstance, opts: { config: ServerConfig }) {
  const { config } = opts;
  const ttlMs = config.SESSION_TTL_HOURS * 3_600_000;

  app.post('/sso', {
    config: { public: true, errorCode: 'sso_failed', rateLimit: { max: 20, timeWindow: '1 minute' } },
    bodyLimit: 16_384,
  }, async (req): Promise<SsoExchangeResponse> => {
    const body = req.body as { token?: unknown } | null | undefined;
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token || token.length > 4096) throw new HttpError(400, 'missing_token', 'A sign-in link from IOsense is required');

    const r = await exchangeSsoToken(token);
    if (!r.ok || !r.user?.userId) {
      throw r.rejected
        ? new HttpError(401, 'sso_rejected', MSG.AUTH_LINK_USED)
        : new HttpError(503, 'sso_unavailable', MSG.AUTH_UNAVAILABLE);
    }
    const { userId, organisation } = r.user;
    if (config.AUTH_ALLOWED_ORGANISATIONS.length && !config.AUTH_ALLOWED_ORGANISATIONS.includes(organisation)) {
      req.log.warn({ userId, organisation }, 'sign-in refused: organisation not allowed');
      throw new HttpError(403, 'forbidden_organisation', MSG.AUTH_ORG_DENIED);
    }
    // Which mills: the person's IOsense role. IOsense not answering → no unchecked way in.
    let access: Access;
    try {
      access = await resolveAccess(r.userBearer!, organisation, config.FULL_ACCESS_ORGANISATIONS, undefined, config.FULL_ACCESS_EMAILS);
    } catch (e) {
      req.log.warn({ userId, organisation, err: (e as Error).message }, 'sign-in refused: role could not be checked');
      throw new HttpError(503, 'access_unavailable', MSG.AUTH_ACCESS_UNAVAILABLE);
    }
    req.log.info({ userId, organisation, email: access.email, role: access.role, roleId: access.roleId, mills: access.mills }, 'IOsense role at sign-in');
    if (!access.mills.length) throw new HttpError(403, 'no_mill_access', MSG.AUTH_NO_MILL);

    const sid = randomUUID();
    const sessionToken = app.jwt.sign({ sub: userId, org: organisation, sid, email: access.email, mills: access.mills });
    keepBearer(sid, r.userBearer!, Date.now() + ttlMs);
    const { exp } = app.jwt.decode<{ exp: number }>(sessionToken)!;
    req.log.info({ userId, organisation, email: access.email }, 'signed in from IOsense');
    return {
      sessionToken, expiresAt: new Date(exp * 1000).toISOString(), user: { userId, organisation },
      access: { mills: access.mills, email: access.email },
    };
  });

  app.get('/session', { config: { public: true } }, async (req): Promise<SessionResponse> => {
    if (config.AUTH_DISABLED) return { authenticated: true, authRequired: false, user: null, expiresAt: null, access: null };
    let s: SessionClaims & { exp: number };
    try {
      s = await req.jwtVerify<SessionClaims & { exp: number }>();
    } catch {
      throw new HttpError(401, 'unauthenticated', MSG.AUTH_REQUIRED);
    }
    const user = { userId: s.sub, organisation: s.org };
    // Opened or refreshed: ask IOsense for the role again (the user, 27 Nov 2026). Not answering, or the person's
    // IOsense session no longer here (a restart): the session keeps what it was signed in with.
    const bearer = bearerOf(s.sid);
    if (bearer) {
      try {
        const now = await resolveAccess(bearer, s.org, config.FULL_ACCESS_ORGANISATIONS, undefined, config.FULL_ACCESS_EMAILS);
        if (!now.mills.length) {
          req.log.info({ userId: s.sub, email: now.email, role: now.role }, 'session ended: no mill in the IOsense role any more');
          throw new HttpError(403, 'no_mill_access', MSG.AUTH_NO_MILL);
        }
        if (!sameMills(s.mills, now.mills)) {
          req.log.info({ userId: s.sub, email: now.email, from: s.mills, to: now.mills, role: now.role }, 'IOsense role changed: session updated');
          // Same end time as before: a refresh never lengthens a session.
          const left = Math.max(1, s.exp - Math.floor(Date.now() / 1000));
          const sessionToken = app.jwt.sign({ sub: s.sub, org: s.org, sid: s.sid, email: now.email, mills: now.mills }, { expiresIn: `${left}s` });
          return { authenticated: true, authRequired: true, user, expiresAt: new Date(s.exp * 1000).toISOString(),
            access: { mills: now.mills, email: now.email }, sessionToken };
        }
      } catch (e) {
        if (!(e instanceof AccessUnavailable)) throw e;
      }
    }
    return {
      authenticated: true, authRequired: true, user, expiresAt: new Date(s.exp * 1000).toISOString(),
      // A session from before per-mill access carries no list: every mill until it ends.
      access: { mills: s.mills ?? ['hsm', 'rmd', 'lsm', 'rms'], email: s.email ?? null },
    };
  });
}
