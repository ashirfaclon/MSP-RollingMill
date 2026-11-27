/**
 * Access control. The app opens only from IOsense: the portal hands it a one-time SSO
 * token, POST /api/auth/sso exchanges it for an app session (a signed, expiring JWT), and
 * every route requires that session as `Authorization: Bearer <session>` — except routes
 * marked `config: { public: true }` (health, readiness, the sign-in itself) and CORS
 * preflights. The frontend's sign-in screen is a courtesy; this hook is the enforcement.
 *
 * AUTH_DISABLED (local development only, refused in production) skips the check.
 */
import { randomBytes } from 'node:crypto';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { ServerConfig } from '../config/server';
import { HttpError } from '../shared/http-error';
import { millOfPath, type MillId } from '../modules/auth/access';
import { MSG } from '../shared/messages';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Reachable without a session. */
    public?: boolean;
  }
}

/**
 * What an app session carries — never the IOsense JWT itself. `mills`: the mills this person may see (the user,
 * 27 Nov 2026); absent on a session from before per-mill access, which then sees every mill until it ends.
 */
export interface SessionClaims { sub: string; org: string; sid?: string; email?: string | null; mills?: MillId[] }

declare module '@fastify/jwt' {
  interface FastifyJWT { payload: SessionClaims; user: SessionClaims & { exp: number } }
}

export default fp(async function auth(app: FastifyInstance, opts: { config: ServerConfig }) {
  const { config } = opts;
  let secret = config.SESSION_SECRET;
  if (!secret) {
    secret = randomBytes(48).toString('base64url');
    if (!config.AUTH_DISABLED) {
      app.log.warn('SESSION_SECRET is not set — using a random one: every restart signs everyone out');
    }
  }
  await app.register(fastifyJwt, { secret, sign: { expiresIn: `${config.SESSION_TTL_HOURS}h` } });

  app.addHook('onRequest', async (req) => {
    if (config.AUTH_DISABLED || req.method === 'OPTIONS') return;
    if (!req.routeOptions.url) return;                       // no such route — the 404 handler answers
    if (req.routeOptions.config.public) return;
    try {
      await req.jwtVerify();
    } catch {
      throw new HttpError(401, 'unauthenticated', MSG.AUTH_REQUIRED);
    }
    // Another mill's data is refused here, whatever the screen shows (the user, 27 Nov 2026).
    const mill = millOfPath(req.url);
    const mills = (req.user as SessionClaims).mills;
    if (mill && mills && !mills.includes(mill)) throw new HttpError(403, 'mill_forbidden', MSG.AUTH_MILL_DENIED);
  });
});
