import { loadEnv } from '@/server/env';
import { HttpError, handle } from '@/server/http';
import { stockReport } from '@/server/hsm/erpKpis';
import { isDate } from '@/server/hsm/production';

/** Finished-strip stock in the FG yard at the end of plant date `to` (YYYY-MM-DD), from the ERP. */
export function GET(req: Request) {
  return handle('hsm_stock_failed', async () => {
    const to = new URL(req.url).searchParams.get('to') ?? '';
    if (!isDate(to)) throw new HttpError(400, 'bad_range', 'to must be a date (YYYY-MM-DD)');
    return stockReport(loadEnv(), to);
  });
}
