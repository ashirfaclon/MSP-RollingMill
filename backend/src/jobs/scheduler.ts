/**
 * Optional in-service ERP sync: every ERP_SYNC_INTERVAL_MINUTES, starting at boot.
 *
 * Each run is the sync CLI in a CHILD PROCESS: the Oracle thick client is native code, and
 * a crash or hang inside it must never take the API down. Runs never overlap. Off (0) by
 * default — on a platform with scheduled jobs, run `node dist/erp-sync.js` there instead.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { FastifyBaseLogger } from 'fastify';

const RUN_TIMEOUT_MS = 10 * 60_000;

/** The sync entry next to this module: dist/erp-sync.js when built, src/jobs/erp-sync.ts under tsx. */
function syncCommand(): string[] {
  const dev = import.meta.url.endsWith('.ts');
  const script = fileURLToPath(new URL(dev ? './erp-sync.ts' : './erp-sync.js', import.meta.url));
  return dev ? ['--import', 'tsx', script] : [script];
}

export function startErpSyncSchedule(intervalMinutes: number, log: FastifyBaseLogger): () => void {
  if (intervalMinutes <= 0) return () => {};
  let running = false;
  let stopped = false;

  const run = () => {
    if (running || stopped) return;
    running = true;
    const child = spawn(process.execPath, syncCommand(), { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const kill = setTimeout(() => child.kill('SIGKILL'), RUN_TIMEOUT_MS);
    child.stdout.on('data', (d: Buffer) => log.info({ job: 'erp-sync' }, d.toString().trim()));
    child.stderr.on('data', (d: Buffer) => log.warn({ job: 'erp-sync' }, d.toString().trim()));
    child.on('exit', (code) => {
      clearTimeout(kill);
      running = false;
      log[code === 0 ? 'info' : 'error']({ job: 'erp-sync', code }, code === 0 ? 'ERP sync finished' : 'ERP sync failed');
    });
  };

  log.info({ job: 'erp-sync', intervalMinutes }, 'ERP sync scheduled');
  run();
  const timer = setInterval(run, intervalMinutes * 60_000);
  timer.unref();
  return () => { stopped = true; clearInterval(timer); };
}
