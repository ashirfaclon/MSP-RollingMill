/**
 * Plant settings, mounted at /api/settings (the Settings screen):
 *   GET  /:mill   every limit of the mill in use, its default and where it came from
 *   POST /:mill   save what changed ({ by, limits }); refused whole, with every problem, when any is wrong
 *   POST /:mill/alerts   the Alerts tab: when each alert notifies ({ by, defaults, rules }), checked the same way
 * Writes need a signed-in user (the auth hook); the store records who saved it.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { loadEnv } from '../../config/env';
import { LIMIT_MILLS, type LimitMill } from '../../config/limits';
import type { AlertSettingsSaveBody, SettingsSaveBody } from '../../contracts';
import { HttpError } from '../../shared/http-error';
import { millSettings, saveMillSettings } from './settings.store';
import { saveAlertSettings } from '../alerts/alerts.service';

export const millOf = (m: string): LimitMill => {
  if (!LIMIT_MILLS.includes(m as LimitMill)) throw new HttpError(400, 'bad_mill', 'mill must be hsm, rmd, lsm or rms');
  return m as LimitMill;
};
/** Who saved it: the signed-in IOsense user, else (sign-in off, e.g. local) the dashboard. */
export const filledByOf = (req: FastifyRequest) => (req.user as { sub?: string } | undefined)?.sub || 'rolling-mill-dashboard';

export async function settingsRoutes(app: FastifyInstance) {
  app.get<{ Params: { mill: string } }>('/:mill', { config: { errorCode: 'settings_read_failed' } }, async (req) =>
    millSettings(loadEnv(), millOf(req.params.mill)));
  app.post<{ Params: { mill: string }; Body: SettingsSaveBody }>('/:mill', { config: { errorCode: 'settings_save_failed' } }, async (req) =>
    saveMillSettings(loadEnv(), millOf(req.params.mill), req.body, filledByOf(req)));
  app.post<{ Params: { mill: string }; Body: AlertSettingsSaveBody }>('/:mill/alerts', { config: { errorCode: 'alert_settings_save_failed' } }, async (req) =>
    saveAlertSettings(loadEnv(), millOf(req.params.mill), req.body, filledByOf(req)));
}
