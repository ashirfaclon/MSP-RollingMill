/**
 * LSM KPIs, mounted at /api/lsm. Only the sources the plant has confirmed are wired: the ERP
 * Production Log Sheet (FA-LP-P) and the logbook's Daily Power Consumption Record.
 */
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../../config/env';
import { searchParams } from '../../shared/request';
import { parseGrain, parseRange } from '../hsm/params';
import { lsmProduction } from './production.service';
import { lsmPowerReport } from '../power/power.service';
import { lsmStock } from './stock.service';
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
}
