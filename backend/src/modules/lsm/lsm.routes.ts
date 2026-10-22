/**
 * LSM KPIs, mounted at /api/lsm. Only the sources the plant has confirmed are wired: the ERP
 * Production Log Sheet (FA-LP-P), the logbook's Daily Power Consumption Record, Production Sheet
 * and LSM Mechanical → Drive Temp, and the plant's October 2026 production plan.
 */
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../../config/env';
import { searchParams } from '../../shared/request';
import { parseGrain, parseRange } from '../hsm/params';
import { lsmProduction, lsmProductionByDay } from './production.service';
import { lsmPowerReport } from '../power/power.service';
import { lsmStock } from './stock.service';
import { lsmPlan, LSM_SHEET_FORM } from './plan.service';
import { formRunningRate } from './running-rate.service';
import { lsmDriveTemp } from './drive-temp.service';
import { isDate } from '../hsm/production.service';
import { HttpError } from '../../shared/http-error';

export async function lsmRoutes(app: FastifyInstance) {
  /** Finished stock by section at the end of date `to` (the plant's stock rule, division LS). */
  app.get('/stock', { config: { errorCode: 'lsm_stock_failed' } }, async (req) => {
    const to = searchParams(req).get('to') ?? '';
    if (!isDate(to)) throw new HttpError(400, 'bad_range', 'to must be a date (YYYY-MM-DD)');
    return lsmStock(loadEnv(), to);
  });

  /** Power consumption: Σ actual kWh of the Daily Power Consumption Record (VCB-1), by the form's date. */
  app.get('/power', { config: { errorCode: 'lsm_power_failed' } }, async (req) => {
    const { from, to } = parseRange(searchParams(req));
    return lsmPowerReport(loadEnv(), from, to);
  });

  /** Production, losses and bypasses: the ERP Production Log Sheet (FA-LP-P), per date / week / month. */
  app.get('/production', { config: { errorCode: 'lsm_production_failed' } }, async (req) => {
    const q = searchParams(req);
    const { from, to } = parseRange(q);
    return lsmProduction(loadEnv(), from, to, parseGrain(q));
  });

  /** Production plan (the October 2026 plan spread to days and shifts) against ERP PRODUTION_MT. */
  app.get('/plan', { config: { errorCode: 'lsm_plan_failed' } }, async (req) => {
    const { from, to } = parseRange(searchParams(req));
    return lsmPlan(loadEnv(), from, to);
  });

  /** Running rate: PRODUTION_MT ÷ running hours calculated from the LSM Production Sheet's runs. */
  /** Asset Health: LSM Mechanical → Drive Temp — bearing temperatures and gearbox oil per drive. */
  app.get('/drive-temp', { config: { errorCode: 'lsm_drive_temp_failed' } }, async (req) => {
    const { from, to } = parseRange(searchParams(req));
    return lsmDriveTemp(loadEnv(), from, to);
  });

  app.get('/running-rate', { config: { errorCode: 'lsm_running_rate_failed' } }, async (req) => {
    const q = searchParams(req);
    const { from, to } = parseRange(q);
    const env = loadEnv();
    return formRunningRate(env, from, to, parseGrain(q), { form: LSM_SHEET_FORM, dayStartMin: 9 * 60, production: (dates) => lsmProductionByDay(env, dates) });
  });
}
