/**
 * RMS KPIs, mounted at /api/rms. Wired so far: production (the ERP log sheet, division RS) and
 * finished stock (the plant's stock rule, division RS).
 */
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../../config/env';
import { searchParams } from '../../shared/request';
import { isDate } from '../hsm/production.service';
import { HttpError } from '../../shared/http-error';
import { rmsStock } from '../lsm/stock.service';
import { parseGrain, parseRange } from '../hsm/params';
import { rmsProduction, rmsProductionByDay } from './production.service';
import { formRunningRate } from '../lsm/running-rate.service';
import { rmsPowerReport } from '../power/power.service';
import { rmsPlan, RMS_SHEET_FORM } from './plan.service';
import { rmsDriveTemp } from './drive-temp.service';

export async function rmsRoutes(app: FastifyInstance) {
  /** Asset Health: RMS Mechanical → Drive Temp — bearing temperatures and gearbox oil per drive. */
  app.get('/drive-temp', { config: { errorCode: 'rms_drive_temp_failed' } }, async (req) => {
    const { from, to } = parseRange(searchParams(req));
    return rmsDriveTemp(loadEnv(), from, to);
  });

  /** Production: the ERP Production Log Sheet (division RS, series L5P), per date / week / month. */
  app.get('/production', { config: { errorCode: 'rms_production_failed' } }, async (req) => {
    const q = searchParams(req);
    const { from, to } = parseRange(q);
    return rmsProduction(loadEnv(), from, to, parseGrain(q));
  });

  /** Finished stock by section at the end of date `to` (the plant's stock rule, division RS). */
  app.get('/stock', { config: { errorCode: 'rms_stock_failed' } }, async (req) => {
    const to = searchParams(req).get('to') ?? '';
    if (!isDate(to)) throw new HttpError(400, 'bad_range', 'to must be a date (YYYY-MM-DD)');
    return rmsStock(loadEnv(), to);
  });

  /** Production by shift: no plan yet; output per shift = the ERP day split by the RMS Production Sheet's prime pieces. */
  app.get('/plan', { config: { errorCode: 'rms_plan_failed' } }, async (req) => {
    const { from, to } = parseRange(searchParams(req));
    return rmsPlan(loadEnv(), from, to);
  });

  /** Power consumption: Σ actual kWh of the RMS Daily Power Consumption Record (VCB-1), by the form's date. */
  app.get('/power', { config: { errorCode: 'rms_power_failed' } }, async (req) => {
    const { from, to } = parseRange(searchParams(req));
    return rmsPowerReport(loadEnv(), from, to);
  });

  /** Running rate: PRODUCTION_MT ÷ running hours calculated from the RMS Production Sheet's runs. */
  app.get('/running-rate', { config: { errorCode: 'rms_running_rate_failed' } }, async (req) => {
    const q = searchParams(req);
    const { from, to } = parseRange(q);
    const env = loadEnv();
    return formRunningRate(env, from, to, parseGrain(q), { form: RMS_SHEET_FORM, dayStartMin: 9 * 60 + 30, production: (dates) => rmsProductionByDay(env, dates) });
  });
}
