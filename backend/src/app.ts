/**
 * Builds the Fastify app without listening — server.ts starts it; tests drive it with
 * `app.inject()`, so every route is tested through the same plugins as production.
 */
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ServerConfig } from './config/server';
import errorHandler from './plugins/error-handler';
import security from './plugins/security';
import auth from './plugins/auth';
import { authRoutes } from './modules/auth/auth.routes';
import { hsmRoutes } from './modules/hsm/hsm.routes';
import { rmdRoutes } from './modules/rmd/rmd.routes';
import { lsmRoutes } from './modules/lsm/lsm.routes';
import { rmsRoutes } from './modules/rms/rms.routes';
import { midRoutes } from './modules/mid/mid.routes';
import { pmRoutes } from './modules/pm/pm.routes';
import { sourcesRoutes } from './modules/sources/sources.routes';
import { systemRoutes, type Lifecycle } from './modules/system/system.routes';

export interface BuildOptions {
  config: ServerConfig;
  lifecycle?: Lifecycle;
}

export async function buildApp({ config, lifecycle = { shuttingDown: false } }: BuildOptions): Promise<FastifyInstance> {
  const pretty = config.NODE_ENV === 'development' && process.stdout.isTTY;
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      // Credentials never reach a log line.
      redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.token'],
      ...(pretty ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } } } : {}),
    },
    trustProxy: config.TRUST_PROXY,
    // Correlate a request across the frontend, a proxy and these logs.
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
    // Plant queries can take a while; a hung client must not hold a socket forever.
    connectionTimeout: 130_000,
    bodyLimit: 64 * 1024,
  });

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Request-Id', req.id);
    return payload;
  });

  await app.register(errorHandler);
  await app.register(security, { config });
  await app.register(auth, { config });

  await app.register(async (api) => {
    await api.register(systemRoutes, { lifecycle });
    await api.register(authRoutes, { prefix: '/auth', config });
    await api.register(sourcesRoutes);
    await api.register(hsmRoutes, { prefix: '/hsm' });
    await api.register(rmdRoutes, { prefix: '/rmd' });
    await api.register(lsmRoutes, { prefix: '/lsm' });
    await api.register(rmsRoutes, { prefix: '/rms' });
    await api.register(midRoutes, { prefix: '/mid' });
    await api.register(pmRoutes, { prefix: '/pm' });
  }, { prefix: '/api' });

  return app;
}
