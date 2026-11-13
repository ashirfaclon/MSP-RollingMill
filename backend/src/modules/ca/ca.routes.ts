/** Condition Analytics costing, mounted at /api/ca — the CA inputs with the mill's figures, per period. */
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../../config/env';
import { searchParams } from '../../shared/request';
import { HttpError } from '../../shared/http-error';
import { parseRange, parseRmdMode } from '../hsm/params';
import { CONFIG_MILLS, type ConfigMill } from '../forms-db/forms';
import { caReport } from './ca.service';

export async function caRoutes(app: FastifyInstance) {
  app.get<{ Params: { mill: string } }>('/:mill', { config: { errorCode: 'ca_failed' } }, async (req) => {
    const mill = req.params.mill as ConfigMill;
    if (!CONFIG_MILLS.includes(mill)) throw new HttpError(400, 'bad_mill', 'mill must be hsm, rmd, lsm or rms');
    const q = searchParams(req);
    const { from, to } = parseRange(q);
    // RMD only: Online / Offline (all on every other mill).
    return caReport(loadEnv(), mill, from, to, mill === 'rmd' ? parseRmdMode(q) : 'all');
  });
}
