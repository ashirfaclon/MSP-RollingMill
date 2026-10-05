import { loadEnv } from '@/server/env';
import { handle } from '@/server/http';
import { ordersReport } from '@/server/hsm/erpKpis';
import { parseGrain, parseRange } from '@/server/hsm/params';
import { PLANT_DAY_START_HOUR, istDate } from '@/server/hsm/production';

/** Sales orders for strip: placed in the range per period, and the open book as of today. */
export function GET(req: Request) {
  return handle('hsm_orders_failed', async () => {
    const q = new URL(req.url).searchParams;
    const { from, to } = parseRange(q);
    const today = istDate(Date.now() - PLANT_DAY_START_HOUR * 3_600_000);
    return ordersReport(loadEnv(), from, to, parseGrain(q), today);
  });
}
