/**
 * Source diagnostics and the logbook session, mounted at /api:
 *   GET  /erp                  ERP sync state (a cache read — never opens the ERP)
 *   GET  /erp/sync             the sync run: in progress, last result, each mill's last fetch
 *   POST /erp/sync             start a sync now (the Sync ERP button), or join the one running
 *   GET  /historian/catalogue  measurements; `?measurement=` its Units, Groups and fields
 *   GET  /ems/equipment        feeders the electrical meters published in the last day
 *   GET  /logbook              logbook session status; entry counts once forms are mapped
 *
 * (The IOsense SSO token is exchanged by POST /api/auth/sso, which also starts the logbook session.)
 */
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../../config/env';
import type { ServerConfig } from '../../config/server';
import type { ErpSyncState } from '../../contracts';
import { startErpSync, syncRun } from '../../jobs/erp-sync-runner';
import { HttpError } from '../../shared/http-error';
import { searchParams } from '../../shared/request';
import { erpMillSyncedAt, erpStatus } from '../../integrations/erp/cache';
import { catalogue, probeHistorian } from '../../integrations/historian/client';
import { probeEms } from '../../integrations/ems/client';
import { fetchLogbookWindow, probeLogbook } from '../../integrations/logbook/client';

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

/** The run's state, its last attempt (a killed run writes none: its end stands in) and each mill's last fetch. */
function syncState(config: ServerConfig): ErpSyncState {
  const env = loadEnv();
  const status = erpStatus(env);
  const { current, lastEnd, nextAllowedAt } = syncRun();
  const recorded = status.lastAttempt;
  const lastAttempt = lastEnd && !lastEnd.ok && (!recorded || Date.parse(recorded.attemptedAt) < lastEnd.at - 5_000)
    ? { attemptedAt: iso(lastEnd.at)!, ok: false, message: 'ERP sync failed', durationMs: 0 }
    : recorded;
  return {
    running: current !== null,
    startedAt: iso(current?.startedAt ?? null),
    trigger: current?.trigger ?? null,
    lastAttempt,
    mills: erpMillSyncedAt(env),
    intervalMinutes: config.ERP_SYNC_INTERVAL_MINUTES,
    nextAllowedAt: iso(nextAllowedAt),
    configured: status.configured,
  };
}

export async function sourcesRoutes(app: FastifyInstance, { config }: { config: ServerConfig }) {
  app.get('/erp', { config: { errorCode: 'erp_status_failed' } }, async () => erpStatus(loadEnv()));

  app.get('/erp/sync', { config: { errorCode: 'erp_sync_state_failed' } }, async () => syncState(config));

  /**
   * Any signed-in user (the user, 25 Nov 2026); per-mill access, when it comes, does not limit this —
   * a run fetches all four mills and shows none of their data. 202 when started or joined.
   */
  app.post('/erp/sync', { config: { errorCode: 'erp_sync_start_failed' } }, async (_req, reply) => {
    if (!erpStatus(loadEnv()).configured) {
      throw new HttpError(503, 'erp_not_configured', 'The ERP connection is not set up on this server');
    }
    const { rested } = startErpSync(app.log, 'manual');
    if (!rested) throw new HttpError(429, 'erp_sync_resting', 'The ERP was synced less than a minute ago — try again shortly');
    reply.code(202);
    return syncState(config);
  });

  /**
   * A measurement name reaches a Flux query, so it is accepted only if the historian itself
   * listed it — user input is never passed through unchecked.
   */
  app.get('/historian/catalogue', { config: { errorCode: 'historian_catalogue_failed' } }, async (req) => {
    const env = loadEnv();
    const measurement = searchParams(req).get('measurement');
    const probe = await probeHistorian(env);
    if (!measurement) return probe;
    if (probe.connection === 'up' && !probe.measurements.includes(measurement)) {
      throw new HttpError(404, 'unknown_measurement', 'No such measurement published in the last day');
    }
    return catalogue(env, measurement);
  });

  app.get('/ems/equipment', { config: { errorCode: 'ems_equipment_failed' } }, async () => probeEms(loadEnv()));

  /** `?days=N` (default 1, max 31) once this mill's forms are mapped. */
  app.get('/logbook', { config: { errorCode: 'logbook_status_failed' } }, async (req) => {
    const env = loadEnv();
    const session = await probeLogbook(env);
    if (session.connection !== 'up' || !session.insightMapped) return { session, forms: null };
    const days = Math.min(31, Math.max(1, Number(searchParams(req).get('days') ?? 1) || 1));
    const now = Date.now();
    const win = await fetchLogbookWindow(now - days * 86_400_000, now, now, env);
    return { session, forms: { connection: win.connection, message: win.message, days, counts: win.formCounts } };
  });
}
