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
import { rmsProduction } from './production.service';

export async function rmsRoutes(app: FastifyInstance) {
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
}
