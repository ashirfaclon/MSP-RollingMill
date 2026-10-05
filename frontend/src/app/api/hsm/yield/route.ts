import { loadEnv } from '@/server/env';
import { handle } from '@/server/http';
import { yieldComparison } from '@/server/hsm/yield';
import { parseGrain, parseRange } from '@/server/hsm/params';

/** Mass yield per period: ERP log sheet (production ÷ input) beside Influx (output tag ÷ billets × set weight). */
export function GET(req: Request) {
  return handle('hsm_yield_failed', async () => {
    const q = new URL(req.url).searchParams;
    const { from, to } = parseRange(q);
    return yieldComparison(loadEnv(), from, to, parseGrain(q));
  });
}
