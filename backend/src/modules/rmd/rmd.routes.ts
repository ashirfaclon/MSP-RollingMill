/**
 * RMD (TMT rolling mill) KPIs, mounted at /api/rmd. Only the sources the plant has
 * confirmed are wired: the Influx billet counters and the logbook power forms. ERP-based
 * figures (production, stock, orders) are on hold until their ERP fields are given.
 */
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../../config/env';
import { searchParams } from '../../shared/request';
import { parseGrain, parseRange } from '../hsm/params';
import { rmdPowerReport } from '../power/power.service';
import { rmdBillets } from './billets.service';
import { rmdCurrentTrend, rmdLive, rmdStationTrend } from './live.service';
import { rmdCondition } from './condition.service';
import { rmdMillSpeed } from './mill-speed.service';
import { rmdChemistry } from './chemistry.service';
import { rmdRunningRate } from './running-rate.service';
import { rmdProduction } from './production.service';
import { rmdStock } from './stock.service';
import { rmdPlan } from './plan.service';
import { rmdAssetForms } from './asset.service';
import { isDate } from '../hsm/production.service';
import { HttpError } from '../../shared/http-error';
import { sharedFresh } from '../../shared/shared-fresh';

/** The historian writes about every 10 s; a 5 s share never hides a new reading for long. */
const LIVE_FRESH_MS = 5_000;
const ZONES = ['route', 'finishing'] as const;
const HOURS = [2, 6, 24, 72];

export async function rmdRoutes(app: FastifyInstance) {
  /** Billets in, per line (M1, M2): the Influx BILLET_COUNT counters, per plant day / week / month. */
  app.get('/billets', { config: { errorCode: 'rmd_billets_failed' } }, async (req) => {
    const q = searchParams(req);
    const { from, to } = parseRange(q);
    return rmdBillets(loadEnv(), from, to, parseGrain(q));
  });

  /** Power consumption: Σ actual kWh of the logbook forms Power Reading VCB 1 / 2 / 3, by the form's date. */
  app.get('/power', { config: { errorCode: 'rmd_power_failed' } }, async (req) => {
    const q = searchParams(req);
    const { from, to } = parseRange(q);
    return rmdPowerReport(loadEnv(), from, to);
  });

  /** The mill flow now: billets since 09:00 IST and every running-status point. */
  /** Live now — one historian read per 5 s however many screens poll it (sharedFresh). */
  app.get('/live', { config: { errorCode: 'rmd_live_failed' } }, async () => sharedFresh('rmd-live', LIVE_FRESH_MS, () => rmdLive(loadEnv())));

  /** One zone's points: running share per interval over the last 2 / 6 / 24 / 72 h. */
  app.get('/stations', { config: { errorCode: 'rmd_stations_failed' } }, async (req) => {
    const q = searchParams(req);
    const zone = q.get('zone') as (typeof ZONES)[number];
    if (!ZONES.includes(zone)) throw new HttpError(400, 'bad_zone', 'zone must be route or finishing');
    const hours = Number(q.get('hours') ?? 6);
    if (!HOURS.includes(hours)) throw new HttpError(400, 'bad_hours', `hours must be one of ${HOURS.join(', ')}`);
    return rmdStationTrend(loadEnv(), zone, hours);
  });

  /** One zone's drives: motor current (A) while running, per interval and over the period (RMD days). */
  app.get('/current', { config: { errorCode: 'rmd_current_failed' } }, async (req) => {
    const q = searchParams(req);
    const zone = q.get('zone') as (typeof ZONES)[number];
    if (!ZONES.includes(zone)) throw new HttpError(400, 'bad_zone', 'zone must be route or finishing');
    const { from, to } = parseRange(q);
    return rmdCurrentTrend(loadEnv(), zone, from, to);
  });

  /** Condition Analytics mimic: each drive group's current and speed while running, over the period. */
  app.get('/condition', { config: { errorCode: 'rmd_condition_failed' } }, async (req) => {
    const { from, to } = parseRange(searchParams(req));
    return rmdCondition(loadEnv(), from, to);
  });

  /** Mill MPS: each mill's last speed reading of the period (m/s), and its trend. */
  app.get('/mill-speed', { config: { errorCode: 'rmd_mill_speed_failed' } }, async (req) => {
    const { from, to } = parseRange(searchParams(req));
    return rmdMillSpeed(loadEnv(), from, to);
  });

  /** Chemical composition: the SMS CCM lollipop samples for RMD in the period. */
  app.get('/chemistry', { config: { errorCode: 'rmd_chemistry_failed' } }, async (req) => {
    const { from, to } = parseRange(searchParams(req));
    return rmdChemistry(loadEnv(), from, to);
  });

  /** Running rate: production ÷ running hours (billets ≤ 10 min apart, either line). Production pending → rate null. */
  app.get('/running-rate', { config: { errorCode: 'rmd_running_rate_failed' } }, async (req) => {
    const q = searchParams(req);
    const { from, to } = parseRange(q);
    return rmdRunningRate(loadEnv(), from, to, parseGrain(q));
  });

  /** Asset health: the logbook's Mill Bearing Temperature and Oil Tank forms, latest in the period. */
  app.get('/asset-forms', { config: { errorCode: 'rmd_asset_forms_failed' } }, async (req) => {
    const { from, to } = parseRange(searchParams(req));
    return rmdAssetForms(loadEnv(), from, to);
  });

  /** Production plan (month-wise FY plan spread to days and shifts) against ERP Prime + SL. */
  app.get('/plan', { config: { errorCode: 'rmd_plan_failed' } }, async (req) => {
    const { from, to } = parseRange(searchParams(req));
    return rmdPlan(loadEnv(), from, to);
  });

  /** Finished stock by bar size in FGYRDP at the end of date `to` (ERP item ledger). */
  app.get('/stock', { config: { errorCode: 'rmd_stock_failed' } }, async (req) => {
    const to = searchParams(req).get('to') ?? '';
    if (!isDate(to)) throw new HttpError(400, 'bad_range', 'to must be a date (YYYY-MM-DD)');
    return rmdStock(loadEnv(), to);
  });

  /** Production and losses: the ERP Production Log Sheet (FA-SKJ), per date / week / month. */
  app.get('/production', { config: { errorCode: 'rmd_production_failed' } }, async (req) => {
    const q = searchParams(req);
    const { from, to } = parseRange(q);
    return rmdProduction(loadEnv(), from, to, parseGrain(q));
  });
}
