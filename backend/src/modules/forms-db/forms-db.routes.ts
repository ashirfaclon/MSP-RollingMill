/**
 * The dashboard's config forms, mounted at /api/forms — the popups save here and read back:
 *   POST /plan/:mill, GET /plan/:mill?month   production plan (one entry per date)
 *   POST /ca/:mill,   GET /ca/:mill?month     CA inputs (one entry per month)
 *   POST /hsm/variance, POST /hsm/setup       HSM checklists
 * Writes need a signed-in user (the auth hook); the entry records who saved it.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { loadEnv } from '../../config/env';
import { searchParams } from '../../shared/request';
import { HttpError } from '../../shared/http-error';
import type { CaInputsBody, FormSaveResult, PlanSaveBody, SetupSaveBody, VarianceSaveBody } from '../../contracts';
import type { FormWrite } from '../../integrations/logbook/client';
import { CA_FORM, CONFIG_MILLS, PLAN_FORM, SETUP_FORM, VARIANCE_FORM, type ConfigMill } from './forms';
import { savePlan, savedPlan } from './plan.store';
import { saveCaInputs, savedCaInputs } from './ca.store';
import { saveSetup, saveVariance } from './checklist.store';

const millOf = (m: string): ConfigMill => {
  if (!CONFIG_MILLS.includes(m as ConfigMill)) throw new HttpError(400, 'bad_mill', 'mill must be hsm, rmd, lsm or rms');
  return m as ConfigMill;
};
/** Who saved it: the signed-in IOsense user, else (sign-in off, e.g. local) the dashboard. */
const filledByOf = (req: FastifyRequest) => (req.user as { sub?: string } | undefined)?.sub || 'rolling-mill-dashboard';
const done = (form: string, w: FormWrite): FormSaveResult => {
  if (!w.ok) throw new HttpError(502, 'logbook_write_failed', `${w.message}${w.saved ? ` (${w.saved} saved before it stopped)` : ''}`);
  return { ok: true, form, entries: w.saved };
};

export async function formsDbRoutes(app: FastifyInstance) {
  app.post<{ Params: { mill: string }; Body: PlanSaveBody }>('/plan/:mill', { config: { errorCode: 'plan_save_failed' } }, async (req) => {
    const mill = millOf(req.params.mill);
    return done(PLAN_FORM[mill], await savePlan(loadEnv(), mill, req.body, filledByOf(req)));
  });
  app.get<{ Params: { mill: string } }>('/plan/:mill', { config: { errorCode: 'plan_read_failed' } }, async (req) =>
    savedPlan(loadEnv(), millOf(req.params.mill), searchParams(req).get('month') ?? ''));

  app.post<{ Params: { mill: string }; Body: CaInputsBody }>('/ca/:mill', { config: { errorCode: 'ca_save_failed' } }, async (req) => {
    const mill = millOf(req.params.mill);
    return done(CA_FORM[mill], await saveCaInputs(loadEnv(), mill, req.body, filledByOf(req)));
  });
  app.get<{ Params: { mill: string } }>('/ca/:mill', { config: { errorCode: 'ca_read_failed' } }, async (req) =>
    savedCaInputs(loadEnv(), millOf(req.params.mill), searchParams(req).get('month') ?? ''));

  app.post<{ Body: VarianceSaveBody }>('/hsm/variance', { config: { errorCode: 'variance_save_failed' } }, async (req) =>
    done(VARIANCE_FORM, await saveVariance(loadEnv(), req.body, filledByOf(req))));
  app.post<{ Body: SetupSaveBody }>('/hsm/setup', { config: { errorCode: 'setup_save_failed' } }, async (req) =>
    done(SETUP_FORM, await saveSetup(loadEnv(), req.body, filledByOf(req))));
}
