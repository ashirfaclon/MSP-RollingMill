import { loadEnv } from '@/server/env';
import { handle } from '@/server/http';
import { counterComparison, type CounterSpec } from '@/server/hsm/production';
import { parseGrain, parseRange } from '@/server/hsm/params';
import { HSM_DISCHARGED_BILLET } from '@/server/historian/tags';

/** Billets into the mill: ERP log sheet INPUT_PCS vs the Influx Dicharged_Billet counter. */
const BILLETS: CounterSpec = {
  key: 'billets',
  tag: HSM_DISCHARGED_BILLET,
  erp: (r) => r.v?.INPUT_PCS ?? null,
};

export function GET(req: Request) {
  return handle('hsm_billets_failed', async () => {
    const q = new URL(req.url).searchParams;
    const { from, to } = parseRange(q);
    return counterComparison(loadEnv(), BILLETS, from, to, parseGrain(q));
  });
}
