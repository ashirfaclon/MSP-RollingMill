/**
 * LSM KPIs, mounted at /api/lsm. Only the sources the plant has confirmed are wired: the ERP
 * Production Log Sheet (FA-LP-P).
 */
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../../config/env';
import { searchParams } from '../../shared/request';
import { parseGrain, parseRange } from '../hsm/params';
import { lsmProduction } from './production.service';

export async function lsmRoutes(app: FastifyInstance) {
  /** Production, losses and bypasses: the ERP Production Log Sheet (FA-LP-P), per date / week / month. */
  app.get('/production', { config: { errorCode: 'lsm_production_failed' } }, async (req) => {
    const q = searchParams(req);
    const { from, to } = parseRange(q);
    return lsmProduction(loadEnv(), from, to, parseGrain(q));
  });
}
