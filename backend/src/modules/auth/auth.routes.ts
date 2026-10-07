/**
 * Sign-in, mounted at /api/auth:
 *   POST /sso      { token } — the IOsense SSO token from the app URL (functionID
 *                  validateSSOToken), exchanged once for an app session
 *   GET  /session  is the caller's session valid? (also tells the frontend when sign-in is off)
 */
import type { FastifyInstance } from 'fastify';
import type { SessionResponse, SsoExchangeResponse } from '../../contracts';
import type { ServerConfig } from '../../config/server';
import { exchangeSsoToken } from '../../integrations/logbook/client';
import { HttpError } from '../../shared/http-error';
import { MSG } from '../../shared/messages';

export async function authRoutes(app: FastifyInstance, opts: { config: ServerConfig }) {
  const { config } = opts;

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
    const sessionToken = app.jwt.sign({ sub: userId, org: organisation });
    const { exp } = app.jwt.decode<{ exp: number }>(sessionToken)!;
    req.log.info({ userId, organisation }, 'signed in from IOsense');
    return { sessionToken, expiresAt: new Date(exp * 1000).toISOString(), user: { userId, organisation } };
  });

  app.get('/session', { config: { public: true } }, async (req): Promise<SessionResponse> => {
    if (config.AUTH_DISABLED) return { authenticated: true, authRequired: false, user: null, expiresAt: null };
    try {
      const s = await req.jwtVerify<{ sub: string; org: string; exp: number }>();
      return { authenticated: true, authRequired: true, user: { userId: s.sub, organisation: s.org }, expiresAt: new Date(s.exp * 1000).toISOString() };
    } catch {
      throw new HttpError(401, 'unauthenticated', MSG.AUTH_REQUIRED);
    }
  });
}
