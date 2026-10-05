import { loadEnv } from '@/server/env';
import { handle } from '@/server/http';
import { sizeReport } from '@/server/hsm/erpKpis';
import { parseRange } from '@/server/hsm/params';

/** Strip produced (stores receipts) and dispatched (sale lines) per size, from the ERP. */
export function GET(req: Request) {
  return handle('hsm_sizes_failed', async () => {
    const { from, to } = parseRange(new URL(req.url).searchParams);
    return sizeReport(loadEnv(), from, to);
  });
}
