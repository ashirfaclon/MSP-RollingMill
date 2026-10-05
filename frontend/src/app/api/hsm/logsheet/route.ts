import { loadEnv } from '@/server/env';
import { handle } from '@/server/http';
import { logSheetReport } from '@/server/hsm/erpKpis';
import { parseGrain, parseRange } from '@/server/hsm/params';

/** ERP Production Log Sheet sums per period — yield, mass balance, quality split, stores check. */
export function GET(req: Request) {
  return handle('hsm_logsheet_failed', async () => {
    const q = new URL(req.url).searchParams;
    const { from, to } = parseRange(q);
    return logSheetReport(loadEnv(), from, to, parseGrain(q));
  });
}
