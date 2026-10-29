/**
 * HSM (Hot Strip Mill) KPIs, mounted at /api/hsm. Every figure is computed in the services;
 * a route only validates its query (params.ts — a bad request is a named 400) and calls one.
 */
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../../config/env';
import { HttpError } from '../../shared/http-error';
import { sharedFresh } from '../../shared/shared-fresh';
import { searchParams } from '../../shared/request';
import { HSM_DISCHARGED_BILLET } from '../../integrations/historian/tags';
import { parseGrain, parseRange } from './params';
import { PLANT_DAY_START_HOUR, counterComparison, isDate, istDate, productionComparison, type CounterSpec } from './production.service';
import { logSheetReport, ordersReport, sizeReport, stockReport } from './erp-kpis.service';
import { electricalDelays } from './electrical-delays.service';
import { hsmMillLoad } from './mill-load.service';
import { STAND_METRICS, hsmLive, standTrend, type StandMetric } from './live.service';
import { yieldComparison } from './yield.service';
import { runningRate } from './running-rate.service';
import { powerReport } from '../power/power.service';
import { planReport } from './plan.service';
import { hsmCosting } from './costing/costing.service';

/** Billets into the mill: ERP log sheet INPUT_PCS vs the Influx Dicharged_Billet counter. */
/** The historian writes about every 10 s; a 5 s share never hides a new reading for long. */
const LIVE_FRESH_MS = 5_000;
const BILLETS: CounterSpec = { key: 'billets', tag: HSM_DISCHARGED_BILLET, erp: (r) => r.v?.INPUT_PCS ?? null };
const STAND_HOURS = [2, 6, 12, 24, 72];

export async function hsmRoutes(app: FastifyInstance) {
  /** Production: ERP log sheet vs the Influx counter, per plant day / week / month. */
  app.get('/production', { config: { errorCode: 'hsm_production_failed' } }, async (req) => {
    const q = searchParams(req);
    const { from, to } = parseRange(q);
    return productionComparison(loadEnv(), from, to, parseGrain(q));
  });

  /** Billets: ERP INPUT_PCS vs the Dicharged_Billet counter. */
  app.get('/billets', { config: { errorCode: 'hsm_billets_failed' } }, async (req) => {
    const q = searchParams(req);
    const { from, to } = parseRange(q);
    return counterComparison(loadEnv(), BILLETS, from, to, parseGrain(q));
  });

  /** Mass yield: ERP log sheet beside the historian (net of by-products). */
  app.get('/yield', { config: { errorCode: 'hsm_yield_failed' } }, async (req) => {
    const q = searchParams(req);
    const { from, to } = parseRange(q);
    return yieldComparison(loadEnv(), from, to, parseGrain(q));
  });

  /** Running rate: Influx production ÷ running hours from billet discharges; ERP rate beside it. */
  app.get('/running-rate', { config: { errorCode: 'hsm_running_rate_failed' } }, async (req) => {
    const q = searchParams(req);
    const { from, to } = parseRange(q);
    return runningRate(loadEnv(), from, to, parseGrain(q));
  });

  /** Power consumption: Σ power-consumed of the logbook form "Electrical HSM → Power Consumption", by the form's date. */
  /** Costing: the plant's monthly conversion-cost sheets for the months of the period. */
  app.get('/costing', { config: { errorCode: 'hsm_costing_failed' } }, async (req) => {
    const { from, to } = parseRange(searchParams(req));
    return hsmCosting(from, to);
  });

  app.get('/power', { config: { errorCode: 'hsm_power_failed' } }, async (req) => {
    const { from, to } = parseRange(searchParams(req));
    return powerReport(loadEnv(), from, to);
  });

  /** Rolling plan (targets) per day and shift, and plan gap against production. */
  app.get('/plan', { config: { errorCode: 'hsm_plan_failed' } }, async (req) => {
    const { from, to } = parseRange(searchParams(req));
    return planReport(loadEnv(), from, to);
  });

  /** ERP Production Log Sheet sums per period — yield, mass balance, quality split, stores check. */
  app.get('/logsheet', { config: { errorCode: 'hsm_logsheet_failed' } }, async (req) => {
    const q = searchParams(req);
    const { from, to } = parseRange(q);
    return logSheetReport(loadEnv(), from, to, parseGrain(q));
  });

  /** Strip produced (stores receipts) and dispatched (sale lines) per size. */
  app.get('/sizes', { config: { errorCode: 'hsm_sizes_failed' } }, async (req) => {
    const { from, to } = parseRange(searchParams(req));
    return sizeReport(loadEnv(), from, to);
  });

  /** Sales orders for strip: placed in the range per period, and the open book as of today. */
  app.get('/orders', { config: { errorCode: 'hsm_orders_failed' } }, async (req) => {
    const q = searchParams(req);
    const { from, to } = parseRange(q);
    const today = istDate(Date.now() - PLANT_DAY_START_HOUR * 3_600_000);
    return ordersReport(loadEnv(), from, to, parseGrain(q), today);
  });

  /** Electrical faults from the logbook's Electrical Delays form, by the form's date. */
  app.get('/electrical-delays', { config: { errorCode: 'hsm_electrical_delays_failed' } }, async (req) => {
    const { from, to } = parseRange(searchParams(req));
    return electricalDelays(loadEnv(), from, to);
  });

  /** Asset Health: the logbook's Mill Load Log Sheet — load (A) and DC motor DE / NDE temperature per stand. */
  app.get('/mill-load', { config: { errorCode: 'hsm_mill_load_failed' } }, async (req) => {
    const { from, to } = parseRange(searchParams(req));
    return hsmMillLoad(loadEnv(), from, to);
  });

  /** Finished-strip stock in the FG yard at the end of plant date `to`. */
  app.get('/stock', { config: { errorCode: 'hsm_stock_failed' } }, async (req) => {
    const to = searchParams(req).get('to') ?? '';
    if (!isDate(to)) throw new HttpError(400, 'bad_range', 'to must be a date (YYYY-MM-DD)');
    return stockReport(loadEnv(), to);
  });

  /** Live state: billets since the plant day began, and each stand's latest drive readings. */
  /** Live now — one historian read per 5 s however many screens poll it (sharedFresh). */
  app.get('/live', { config: { errorCode: 'hsm_live_failed' } }, async () => sharedFresh('hsm-live', LIVE_FRESH_MS, () => hsmLive(loadEnv())));

  /** Stand trend: `group` roughing | finishing, `metric` current | rpm | force | onOff, `hours` 2–72. */
  app.get('/stands', { config: { errorCode: 'hsm_stands_failed' } }, async (req) => {
    const q = searchParams(req);
    const group = q.get('group') ?? '';
    const metric = (q.get('metric') ?? 'current') as StandMetric;
    const hours = Number(q.get('hours') ?? 6);
    if (group !== 'roughing' && group !== 'finishing') throw new HttpError(400, 'bad_group', 'group must be roughing or finishing');
    if (!(metric in STAND_METRICS)) throw new HttpError(400, 'bad_metric', `metric must be one of ${Object.keys(STAND_METRICS).join(', ')}`);
    if (!STAND_HOURS.includes(hours)) throw new HttpError(400, 'bad_hours', `hours must be one of ${STAND_HOURS.join(', ')}`);
    return standTrend(loadEnv(), group, metric, hours);
  });
}
