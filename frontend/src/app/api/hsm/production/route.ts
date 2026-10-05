import { loadEnv } from '@/server/env';
import { handle } from '@/server/http';
import { productionComparison } from '@/server/hsm/production';
import { parseGrain, parseRange } from '@/server/hsm/params';

/**
 * HSM production, ERP vs the Influx counter, for plant dates `from`..`to` (YYYY-MM-DD,
 * inclusive), grouped by `grain` (day | week | month). All figures are computed here.
 */
export function GET(req: Request) {
  return handle('hsm_production_failed', async () => {
    const q = new URL(req.url).searchParams;
    const { from, to } = parseRange(q);
    return productionComparison(loadEnv(), from, to, parseGrain(q));
  });
}
