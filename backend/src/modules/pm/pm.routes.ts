/** ERP PM, mounted at /api/pm — one report per mill for the Duration period. */
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../../config/env';
import { searchParams } from '../../shared/request';
import { parseRange } from '../hsm/params';
import { HttpError } from '../../shared/http-error';
import { PM_DIVISIONS, type PmMill } from '../../integrations/erp/cache';
import { pmReport } from './pm.service';

export async function pmRoutes(app: FastifyInstance) {
  app.get<{ Params: { mill: string } }>('/:mill', { config: { errorCode: 'pm_failed' } }, async (req) => {
    const mill = req.params.mill as PmMill;
    if (!(mill in PM_DIVISIONS)) throw new HttpError(400, 'bad_mill', 'mill must be hsm, rmd, lsm or rms');
    const { from, to } = parseRange(searchParams(req));
    return pmReport(loadEnv(), mill, from, to);
  });
}
