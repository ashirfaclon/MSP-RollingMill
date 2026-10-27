/** MID vibration monitoring, mounted at /api/mid — one report per mill, up to the period's end. */
import type { FastifyInstance } from 'fastify';
import { searchParams } from '../../shared/request';
import { parseRange } from '../hsm/params';
import { HttpError } from '../../shared/http-error';
import { midReport } from './mid.service';

const MILLS = ['hsm', 'rmd', 'lsm', 'rms'] as const;

export async function midRoutes(app: FastifyInstance) {
  app.get<{ Params: { mill: string } }>('/:mill', { config: { errorCode: 'mid_failed' } }, async (req) => {
    const mill = req.params.mill as (typeof MILLS)[number];
    if (!MILLS.includes(mill)) throw new HttpError(400, 'bad_mill', 'mill must be hsm, rmd, lsm or rms');
    const { to } = parseRange(searchParams(req));
    return midReport(mill, to);
  });
}
