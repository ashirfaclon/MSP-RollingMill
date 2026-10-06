/**
 * Source diagnostics and the logbook session, mounted at /api:
 *   GET  /erp                  ERP sync state (a cache read — never opens the ERP)
 *   GET  /historian/catalogue  measurements; `?measurement=` its Units, Groups and fields
 *   GET  /ems/equipment        feeders the electrical meters published in the last day
 *   GET  /logbook              logbook session status; entry counts once forms are mapped
 *   POST /logbook-sso          exchange the portal's one-time SSO token for a session
 */
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../../config/env';
import { HttpError } from '../../shared/http-error';
import { searchParams } from '../../shared/request';
import { erpStatus } from '../../integrations/erp/cache';
import { catalogue, probeHistorian } from '../../integrations/historian/client';
import { probeEms } from '../../integrations/ems/client';
import { exchangeSsoToken, fetchLogbookWindow, probeLogbook } from '../../integrations/logbook/client';

export async function sourcesRoutes(app: FastifyInstance) {
  app.get('/erp', { config: { errorCode: 'erp_status_failed' } }, async () => erpStatus(loadEnv()));

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

  /** The resulting Bearer stays in server memory — it is never returned to the browser. */
  app.post('/logbook-sso', { config: { errorCode: 'logbook_sso_failed' }, bodyLimit: 16_384 }, async (req) => {
    const body = req.body as { token?: unknown } | null | undefined;
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token || token.length > 4096) throw new HttpError(400, 'missing_token', 'An access token is required');
    const r = await exchangeSsoToken(token);
    if (!r.ok) throw new HttpError(401, 'sso_rejected', r.message);
    return { ok: true, message: r.message };
  });
}
