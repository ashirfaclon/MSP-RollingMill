/**
 * Alerts, mounted at /api/alerts (the Alerts page):
 *   GET /:mill   every reading past its limit and every failed data check of the mill, with the
 *                mill's alert rules and their settings (saved at POST /api/settings/:mill/alerts)
 */
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../../config/env';
import { millOf } from '../settings/settings.routes';
import { millAlerts } from './alerts.service';

export async function alertsRoutes(app: FastifyInstance) {
  app.get<{ Params: { mill: string } }>('/:mill', { config: { errorCode: 'alerts_failed' } }, async (req) =>
    millAlerts(loadEnv(), millOf(req.params.mill)));
}
