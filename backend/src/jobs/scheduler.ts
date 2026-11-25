/**
 * Optional in-service ERP sync: every ERP_SYNC_INTERVAL_MINUTES, starting at boot. Each tick is
 * the shared run (erp-sync-runner.ts) — a tick while a run is going (the Sync ERP button's) joins
 * it. Off (0) by default — on a platform with scheduled jobs, run `node dist/erp-sync.js` there instead.
 */
import type { FastifyBaseLogger } from 'fastify';
import { startErpSync } from './erp-sync-runner';

export function startErpSyncSchedule(intervalMinutes: number, log: FastifyBaseLogger): () => void {
  if (intervalMinutes <= 0) return () => {};
  let stopped = false;
  const run = () => { if (!stopped) startErpSync(log, 'schedule'); };

  log.info({ job: 'erp-sync', intervalMinutes }, 'ERP sync scheduled');
  run();
  const timer = setInterval(run, intervalMinutes * 60_000);
  timer.unref();
  return () => { stopped = true; clearInterval(timer); };
}
