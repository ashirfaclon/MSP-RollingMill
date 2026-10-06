/** GET /api/health, /api/ready, /api/config, /api/sources, /api/erp — service and source status. */

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

/** One ERP division and how many asset-register rows it books — raw, as synced. */
export interface ErpDivisionRow { entity: string; division: string; assetRows: number }

/** Outcome of the most recent sync attempt, successful or not. */
export interface ErpSyncAttempt { attemptedAt: string; ok: boolean; message: string; durationMs: number }

export interface ErpStatus {
  connection: 'up' | 'down';
  configured: boolean;
  message: string;
  syncedAt: string | null;
  ageMinutes: number | null;
  lastAttempt: ErpSyncAttempt | null;
  divisions: ErpDivisionRow[];
}

export type SourceId = 'historian' | 'ems' | 'erp' | 'logbook';

export interface HealthResponse { ok: true; time: string }
export interface ReadyResponse { ready: boolean; checks: Record<string, boolean> }
export interface ConfigResponse { poll_interval_seconds: number }
