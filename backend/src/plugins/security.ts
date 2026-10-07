/**
 * Transport security for a JSON API called from a browser on another origin:
 *   – CORS: only the frontend origin(s) in CORS_ORIGINS; none configured = no cross-origin
 *     access at all (a same-origin proxy still works);
 *   – helmet: standard security headers;
 *   – a per-IP rate limit, so a stuck polling loop cannot hammer the plant systems;
 *   – `Cache-Control: no-store` on every response — figures are live and must not be cached.
 */
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { ServerConfig } from '../config/server';

export default fp(async function security(app: FastifyInstance, opts: { config: ServerConfig }) {
  const { config } = opts;

  await app.register(cors, {
    origin: config.CORS_ORIGINS.includes('*') ? true : config.CORS_ORIGINS.length ? config.CORS_ORIGINS : false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });

  await app.register(helmet, {
    // A JSON API: no HTML to protect with CSP, and it is read from the frontend's origin.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  if (config.RATE_LIMIT_PER_MINUTE > 0) {
    await app.register(rateLimit, {
      max: config.RATE_LIMIT_PER_MINUTE,
      timeWindow: '1 minute',
      // Probes must never be throttled.
      allowList: (req) => req.url === '/api/health' || req.url === '/api/ready',
    });
  }

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('Cache-Control', 'no-store');
    return payload;
  });
});
