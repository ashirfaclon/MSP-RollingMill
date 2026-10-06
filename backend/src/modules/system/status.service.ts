/**
 * Connection status of every source, checked in parallel. This is the backend's
 * "test connection": each source is actually exercised (a metadata query, a session probe,
 * the ERP cache), never inferred from configuration alone — and "reachable" is kept apart
 * from "fresh", because a server that answers while its data has stopped is not healthy.
 *
 * Memoised briefly with in-flight dedupe, so a screen polling this cannot multiply load on
 * the plant systems.
 */
import { loadEnv, type Env } from '../../config/env';
import { SOURCE_LABEL, type SourceId } from '../../shared/messages';
import { probeHistorian } from '../../integrations/historian/client';
import { HSM_MEASUREMENT } from '../../integrations/historian/tags';
import { probeEms } from '../../integrations/ems/client';
import { erpStatus } from '../../integrations/erp/cache';
import { probeLogbook } from '../../integrations/logbook/client';
import type { SourceStatus, SourcesReport } from '../../contracts';
export type { SourceStatus, SourcesReport };

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
