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

export type ErpMill = 'hsm' | 'rmd' | 'lsm' | 'rms';

/**
 * GET / POST /api/erp/sync — the ERP sync the dashboard's Sync ERP button starts (the user, 25 Nov 2026):
 * one run pulls all four mills; each mill's time is the oldest of its own files, so a part that did not
 * sync shows as older.
 */
export interface ErpSyncState {
  running: boolean;
  /** The run in progress: when it started, and whether the schedule or a person started it. */
  startedAt: string | null;
  trigger: 'schedule' | 'manual' | null;
  /** The last finished run, successful or not. */
  lastAttempt: ErpSyncAttempt | null;
  /** When each mill's ERP data was last fetched; null if never. */
  mills: Record<ErpMill, string | null>;
  /** The automatic sync's interval, minutes; 0 = off. */
  intervalMinutes: number;
  /** A new run can be started from this time (a short rest after each run, so the ERP is not hammered). */
  nextAllowedAt: string | null;
  configured: boolean;
}

export type SourceId = 'historian' | 'ems' | 'erp' | 'logbook';

export interface HealthResponse { ok: true; time: string }
export interface ReadyResponse { ready: boolean; checks: Record<string, boolean> }
export interface ConfigResponse { poll_interval_seconds: number }

/** POST /api/auth/sso — the IOsense SSO token exchanged for an app session. */
/** The mills a signed-in person may see (the user, 27 Nov 2026) — from their IOsense role. */
export interface SessionAccess {
  mills: ('hsm' | 'rmd' | 'lsm' | 'rms')[];
  email: string | null;
}

export interface SsoExchangeResponse {
  /** Send as `Authorization: Bearer <sessionToken>` on every API call. */
  sessionToken: string;
  expiresAt: string;
  user: { userId: string; organisation: string };
  access: SessionAccess;
}

/** GET /api/auth/session — whether the caller may use the API. */
export interface SessionResponse {
  authenticated: true;
  /** false only when the backend runs with AUTH_DISABLED (local development). */
  authRequired: boolean;
  user: { userId: string; organisation: string } | null;
  expiresAt: string | null;
  /** null with sign-in off (every mill). */
  access: SessionAccess | null;
  /** Set when the role changed since sign-in: use this session from now on. */
  sessionToken?: string;
}
