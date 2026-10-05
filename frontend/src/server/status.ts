/**
 * Connection status of every source, checked in parallel. This is the backend's
 * "test connection": each source is actually exercised (a metadata query, a session probe,
 * the ERP cache), never inferred from configuration alone — and "reachable" is kept apart
 * from "fresh", because a server that answers while its data has stopped is not healthy.
 *
 * Memoised briefly with in-flight dedupe, so a screen polling this cannot multiply load on
 * the plant systems.
 */
import { loadEnv, type Env } from './env';
import { SOURCE_LABEL, type SourceId } from './sources';
import { probeHistorian } from './historian/client';
import { HSM_MEASUREMENT } from './historian/tags';
import { probeEms } from './ems/client';
import { erpStatus } from './erp/cache';
import { probeLogbook } from './logbook/client';

export interface SourceStatus {
  id: SourceId;
  label: string;
  /** Reachable and answering. */
  connection: 'up' | 'down';
  /** Credentials/addresses present — distinguishes "not configured" from "unreachable". */
  configured: boolean;
  /** Up AND its data is current. */
  fresh: boolean;
  message: string;
  latencyMs: number | null;
  /** When the source last had new data for this mill; null if unknown or none. */
  lastDataAt: string | null;
  /** Source-specific facts: counts, sync age. Never credentials or hostnames. */
  detail: Record<string, string | number | boolean | null>;
}

export interface SourcesReport {
  checkedAt: string;
  sources: SourceStatus[];
}

/** An ERP sync older than this is stale — the sync is meant to be scheduled. */
const ERP_FRESH_MIN = 24 * 60;
const MEMO_MS = 15_000;
let memo: { at: number; report: SourcesReport } | null = null;
let pending: Promise<SourcesReport> | null = null;

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

export async function checkSources(env: Env = loadEnv(), force = false): Promise<SourcesReport> {
  if (!force && memo && Date.now() - memo.at < MEMO_MS) return memo.report;
  if (pending) return pending;
  pending = (async () => {
    const [h, e, l] = await Promise.all([probeHistorian(env, HSM_MEASUREMENT), probeEms(env), probeLogbook(env)]);
    const erp = erpStatus(env);
    const s = (id: SourceId, rest: Omit<SourceStatus, 'id' | 'label'>): SourceStatus =>
      ({ id, label: SOURCE_LABEL[id], ...rest });
    const report: SourcesReport = {
      checkedAt: new Date().toISOString(),
      sources: [
        s('historian', {
          connection: h.connection, configured: h.configured, fresh: h.connection === 'up' && h.fresh,
          message: h.message, latencyMs: h.latencyMs, lastDataAt: iso(h.lastReadingAt),
          detail: { measurements: h.measurements.length, millMeasurement: HSM_MEASUREMENT },
        }),
        s('ems', {
          connection: e.connection, configured: e.configured, fresh: e.connection === 'up' && e.fresh,
          message: e.message, latencyMs: e.latencyMs, lastDataAt: iso(e.lastReadingAt),
          detail: { equipment: e.equipment.length },
        }),
        s('erp', {
          connection: erp.connection, configured: erp.configured,
          fresh: erp.connection === 'up' && erp.ageMinutes !== null && erp.ageMinutes <= ERP_FRESH_MIN,
          message: erp.message, latencyMs: null, lastDataAt: erp.syncedAt,
          detail: { ageMinutes: erp.ageMinutes, divisions: erp.divisions.length, lastAttemptOk: erp.lastAttempt?.ok ?? null },
        }),
        s('logbook', {
          connection: l.connection, configured: l.configured, fresh: l.connection === 'up',
          message: l.message, latencyMs: l.latencyMs, lastDataAt: null,
          detail: { formsMapped: l.insightMapped },
        }),
      ],
    };
    memo = { at: Date.now(), report };
    return report;
  })().finally(() => { pending = null; });
  return pending;
}
