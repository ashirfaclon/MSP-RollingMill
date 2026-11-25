/**
 * The one ERP sync run of this service — started by the schedule (scheduler.ts) or by a person
 * (POST /api/erp/sync, the dashboard's Sync ERP button). Runs never overlap: a start while one is
 * running joins it. After each run a short rest (REST_MS) before a person may start another,
 * so repeated presses cannot keep the ERP busy; the schedule is not held by it.
 *
 * Each run is the sync CLI in a CHILD PROCESS: the Oracle thick client is native code, and a
 * crash or hang inside it must never take the API down. Killed after RUN_TIMEOUT_MS.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { FastifyBaseLogger } from 'fastify';

const RUN_TIMEOUT_MS = 10 * 60_000;
export const REST_MS = 60_000;

export type SyncTrigger = 'schedule' | 'manual';

/** The sync entry next to this module: dist/erp-sync.js when built, src/jobs/erp-sync.ts under tsx. */
function syncCommand(): string[] {
  const dev = import.meta.url.endsWith('.ts');
  const script = fileURLToPath(new URL(dev ? './erp-sync.ts' : './erp-sync.js', import.meta.url));
  return dev ? ['--import', 'tsx', script] : [script];
}

let current: { startedAt: number; trigger: SyncTrigger } | null = null;
/** The last run's end — also when it never wrote its attempt (killed, or failed to start). */
let lastEnd: { at: number; ok: boolean } | null = null;

export function syncRun() {
  return { current, lastEnd, nextAllowedAt: lastEnd && !current ? lastEnd.at + REST_MS : null };
}

/**
 * Start a run, or join the one in progress. A person's start inside the rest after a run is refused
 * (`rested: false`); nothing runs.
 */
export function startErpSync(log: FastifyBaseLogger, trigger: SyncTrigger, now = Date.now()): { started: boolean; rested: boolean } {
  if (current) return { started: false, rested: true };
  if (trigger === 'manual' && lastEnd && now < lastEnd.at + REST_MS) return { started: false, rested: false };
  current = { startedAt: now, trigger };
  log.info({ job: 'erp-sync', trigger }, 'ERP sync started');

  const end = (ok: boolean, code: number | null) => {
    if (!current) return;
    current = null;
    lastEnd = { at: Date.now(), ok };
    log[ok ? 'info' : 'error']({ job: 'erp-sync', code }, ok ? 'ERP sync finished' : 'ERP sync failed');
  };
  try {
    const child = spawn(process.execPath, syncCommand(), { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const kill = setTimeout(() => child.kill('SIGKILL'), RUN_TIMEOUT_MS);
    child.stdout.on('data', (d: Buffer) => log.info({ job: 'erp-sync' }, d.toString().trim()));
    child.stderr.on('data', (d: Buffer) => log.warn({ job: 'erp-sync' }, d.toString().trim()));
    child.on('error', (err) => { clearTimeout(kill); log.error({ job: 'erp-sync', err: err.message }, 'ERP sync could not start'); end(false, null); });
    child.on('exit', (code) => { clearTimeout(kill); end(code === 0, code); });
  } catch (err) {
    log.error({ job: 'erp-sync', err: (err as Error).message }, 'ERP sync could not start');
    end(false, null);
  }
  return { started: true, rested: true };
}
