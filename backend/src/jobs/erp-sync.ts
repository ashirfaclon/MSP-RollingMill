/**
 * ERP sync, once: `npm run sync:erp` (dev) or `node dist/erp-sync.js` (built). Exit code 0 on
 * success, 1 on failure — for cron, a Kubernetes CronJob, or the in-service schedule.
 */
import { runErpSync } from '../integrations/erp/sync';

const result = await runErpSync();
process.exit(result.ok ? 0 : 1);
