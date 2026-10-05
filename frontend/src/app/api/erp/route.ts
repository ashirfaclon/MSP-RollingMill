import { loadEnv } from '@/server/env';
import { erpStatus } from '@/server/erp/cache';
import { handle } from '@/server/http';

/** ERP sync state and division census — a cache read; this route never opens the ERP. */
export function GET() {
  return handle('erp_status_failed', async () => erpStatus(loadEnv()));
}
