/**
 * Service endpoints, mounted at /api:
 *   GET /health   liveness — the process is up (never touches a plant system)
 *   GET /ready    readiness — false while shutting down, so a load balancer drains it first
 *   GET /config   settings the frontend needs (poll interval)
 *   GET /sources  every source actually exercised; `?refresh=1` bypasses the 15 s memo
 */
import type { FastifyInstance } from 'fastify';
import type { ConfigResponse, HealthResponse, ReadyResponse } from '../../contracts';
import { loadEnv } from '../../config/env';
import { erpStatus } from '../../integrations/erp/cache';
import { historianConfigured } from '../../integrations/historian/client';
import { searchParams } from '../../shared/request';
import { checkSources } from './status.service';

export interface Lifecycle { shuttingDown: boolean }

export async function systemRoutes(app: FastifyInstance, opts: { lifecycle: Lifecycle }) {
  app.get('/health', async (): Promise<HealthResponse> => ({ ok: true, time: new Date().toISOString() }));

  app.get('/ready', async (_req, reply): Promise<ReadyResponse> => {
    const env = loadEnv();
    const ready = !opts.lifecycle.shuttingDown;
    if (!ready) reply.status(503);
    // Sources degrade one by one with a stated reason; they are reported, never gate readiness.
    return { ready, checks: { historianConfigured: historianConfigured(env), erpCache: erpStatus(env).syncedAt !== null } };
  });

  app.get('/config', async (): Promise<ConfigResponse> => ({ poll_interval_seconds: loadEnv().pollIntervalSeconds }));

  app.get('/sources', { config: { errorCode: 'sources_check_failed' } }, async (req) =>
    checkSources(undefined, searchParams(req).get('refresh') === '1'));
}
