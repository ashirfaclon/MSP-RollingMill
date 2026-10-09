/**
 * Logbook feed — the plant's digital forms, served as an IOsense Bruce insight. Ported
 * from the pellet client (handover §5).
 *
 * Auth: a one-time SSO token arrives on the app URL (?token=); the browser posts it to
 * /api/auth/sso, which exchanges it here (signing the user in to the app) and keeps the
 * resulting Bearer JWT IN PROCESS MEMORY only — never sent to the browser, never written
 * to disk. A PAT in .env.local may seed a session
 * (a PAT does not expire; an SSO session dies with the process). With no valid session
 * every logbook-derived value stays NA. No substitution, ever.
 *
 * IOsense functionIDs used (tracked in iosense.md):
 *   validateSSOToken    GET  /api/retrieve-sso-token/{token}
 *   findUserDevices     PUT  /api/account/devices/1/1          — session probe only
 *   insightResult fetch PUT  /api/account/bruce/insightResult/fetch/paginated/{id}
 */
import { loadEnv, type Env } from '../../config/env';
import { MSG } from '../../shared/messages';

const PAGE = 500;
const MAX_PAGES = 20;
const CACHE_MS = 5 * 60_000;
const STALE_MS = 30 * 60_000;
const CACHE_MAX = 8;
const TIMEOUT_MS = 20_000;

/** Bookkeeping rows the engine adds — never form entries. */
const NON_DATA = new Set(['__accessControl', 'browser-write-test']);

/* ------------------------------- session ------------------------------- */

/** undefined = not yet seeded from the environment; null = no session. */
let bearer: string | null | undefined;

function currentBearer(env: Env): string | null {
  if (bearer === undefined) bearer = env.iosenseBearer;
  return bearer;
}

/** Why the session was dropped, so the status can say "expired" rather than "not connected". */
let droppedReason: string | null = null;

function dropSession(reason: string) {
  bearer = null;
  droppedReason = reason;
  cache.length = 0;
}

const headers = (env: Env, auth?: string): Record<string, string> => ({
  ...(auth ? { Authorization: auth } : {}),
  organisation: env.iosenseOrg,
  'ngsw-bypass': 'true',
  'Content-Type': 'application/json',
});

const isAuthFailure = (status: number, errors: unknown) =>
  status === 401 || /session expired|auth|token|unauthor/i.test(String(errors ?? ''));

export interface SsoExchange {
  ok: boolean;
  message: string;
  /** Who IOsense signed in — present when ok. */
  user?: { userId: string; organisation: string };
  /** true when IOsense answered and refused the token (vs. could not be reached). */
  rejected?: boolean;
}

/**
 * Exchange a one-time SSO token (functionID validateSSOToken) for a session. The token is
 * single-use and lives 60 s, so it is exchanged exactly once and never retried.
 */
export async function exchangeSsoToken(ssoToken: string, env = loadEnv()): Promise<SsoExchange> {
  try {
    const res = await fetch(`${env.iosenseBase}/api/retrieve-sso-token/${encodeURIComponent(ssoToken)}`, {
      headers: headers(env), signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json()) as { success?: boolean; token?: string; userId?: string; organisation?: string };
    if (!body.success || !body.token) return { ok: false, rejected: true, message: MSG.LOGBOOK_SESSION_EXPIRED };
    // Already prefixed "Bearer " — store and send as-is.
    bearer = body.token.startsWith('Bearer ') ? body.token : `Bearer ${body.token}`;
    droppedReason = null;
    // A new session invalidates everything fetched under the old one.
    cache.length = 0;
    return { ok: true, message: MSG.LOGBOOK_UP, user: { userId: String(body.userId ?? ''), organisation: String(body.organisation ?? '') } };
  } catch {
    return { ok: false, message: MSG.LOGBOOK_UNREACHABLE };
  }
}

export interface LogbookProbe {
  connection: 'up' | 'down';
  configured: boolean;
  message: string;
  latencyMs: number | null;
  /** Whether this mill's forms insight is known yet. */
  insightMapped: boolean;
}

/**
 * Session check (functionID findUserDevices, one device): proves the bearer is accepted
 * without depending on an insight that is not mapped yet. A rejection drops the session.
 */
export async function probeLogbook(env = loadEnv()): Promise<LogbookProbe> {
  const insightMapped = Boolean(env.logbookInsightId);
  const auth = currentBearer(env);
  if (!auth) {
    return {
      connection: 'down', configured: false, latencyMs: null, insightMapped,
      message: droppedReason ?? MSG.LOGBOOK_NO_SESSION,
    };
  }
  const t0 = Date.now();
  try {
    const res = await fetch(`${env.iosenseBase}/api/account/devices/1/1`, {
      method: 'PUT',
      headers: headers(env, auth),
      body: JSON.stringify({ search: [], filter: [], order: 'default', sort: 'AtoZ' }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; errors?: unknown };
    if (!body.success) {
      if (isAuthFailure(res.status, body.errors)) dropSession(MSG.LOGBOOK_SESSION_EXPIRED);
      return {
        connection: 'down', configured: true, latencyMs: null, insightMapped,
        message: isAuthFailure(res.status, body.errors) ? MSG.LOGBOOK_SESSION_EXPIRED : MSG.LOGBOOK_UNREACHABLE,
      };
    }
    return {
      connection: 'up', configured: true, latencyMs: Date.now() - t0, insightMapped,
      message: insightMapped ? MSG.LOGBOOK_UP : MSG.LOGBOOK_NOT_MAPPED,
    };
  } catch {
    return { connection: 'down', configured: true, latencyMs: null, insightMapped, message: MSG.LOGBOOK_UNREACHABLE };
  }
}

/* -------------------------------- fetch -------------------------------- */

/** One logbook entry exactly as the Bruce engine returns it. */
export interface InsightRow {
  resultName?: string;
  tags?: string[];
  result?: Record<string, unknown>;
  invocationTime?: string;
  createdAt?: string;
}

export interface LogbookWindow {
  connection: 'up' | 'down';
  message: string;
  rows: InsightRow[];
  /** form slug → entry count. */
  formCounts: Record<string, number>;
}

const down = (message: string): LogbookWindow => ({ connection: 'down', message, rows: [], formCounts: {} });

/*
 * Window cache — containment lookup + stale-while-revalidate + in-flight dedupe.
 * The part of this client most worth keeping: a naive exact-match cache produced a
 * visible periodic stall (handover §5.3).
 */
interface CacheEntry { at: number; from: number; to: number; win: LogbookWindow }
const cache: CacheEntry[] = [];
const inflight: { from: number; to: number; p: Promise<LogbookWindow> }[] = [];

function findCovering(from: number, to: number, nowMs: number) {
  for (const e of cache) {
    if (e.from <= from && e.to >= to && nowMs - e.at < STALE_MS) return { win: e.win, fresh: nowMs - e.at < CACHE_MS };
  }
  return null;
}

/** Start covered, end short by at most two steps: serve it while a refresh runs behind. */
function findServiceable(from: number, to: number, nowMs: number): LogbookWindow | null {
  for (const e of cache) {
    if (e.from <= from && e.to >= to - 2 * CACHE_MS && nowMs - e.at < STALE_MS) return e.win;
  }
  return null;
}

function remember(from: number, to: number, nowMs: number, win: LogbookWindow) {
  cache.unshift({ at: nowMs, from, to, win });
  if (cache.length > CACHE_MAX) cache.length = CACHE_MAX;
}

/** Entries for a window. Date filtering is pushed down to the API. */
export async function fetchLogbookWindow(
  fromMs: number, toMs: number, nowMs = Date.now(), env = loadEnv(),
  /** Internal: a background revalidation must not re-enter the cache branches. */
  force = false,
): Promise<LogbookWindow> {
  const auth = currentBearer(env);
  if (!auth) return down(droppedReason ?? MSG.LOGBOOK_NO_SESSION);
  const insightId = env.logbookInsightId;
  if (!insightId) return down(MSG.LOGBOOK_NOT_MAPPED);

  // Round outward to the cache grid; the end by TWO steps so the entry still covers the
  // bucket the clock is about to cross (one step made every fifth-minute poll block).
  const from = Math.floor(fromMs / CACHE_MS) * CACHE_MS;
  const to = (Math.ceil(toMs / CACHE_MS) + 1) * CACHE_MS;

  const hit = force ? null : findCovering(from, to, nowMs);
  if (hit?.fresh) return hit.win;
  const pending = inflight.find((f) => f.from <= from && f.to >= to);
  if (pending) return hit ? hit.win : pending.p;
  const serviceable = hit?.win ?? (force ? null : findServiceable(from, to, nowMs));
  if (serviceable) {
    void fetchLogbookWindow(fromMs, toMs, Date.now(), env, true).catch(() => undefined);
    return serviceable;
  }

  let release!: (w: LogbookWindow) => void;
  const entry = { from, to, p: new Promise<LogbookWindow>((res) => { release = res; }) };
  inflight.push(entry);
  const settle = (w: LogbookWindow) => {
    release(w);
    inflight.splice(inflight.indexOf(entry), 1);
    return w;
  };

  const rows: InsightRow[] = [];
  try {
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const res = await fetch(
        `${env.iosenseBase}/api/account/bruce/insightResult/fetch/paginated/${encodeURIComponent(insightId)}`,
        {
          method: 'PUT',
          headers: headers(env, auth),
          body: JSON.stringify({
            insightID: insightId,
            pagination: { page, count: PAGE },
            filters: { startDate: new Date(from).toISOString(), endDate: new Date(to).toISOString() },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean; errors?: unknown;
        data?: { data?: InsightRow[]; totalCount?: number } | InsightRow[];
      };
      if (!body.success) {
        // An expired session must drop the token so the UI can ask for a fresh one.
        const authFail = isAuthFailure(res.status, body.errors);
        if (authFail) dropSession(MSG.LOGBOOK_SESSION_EXPIRED);
        const out = down(authFail ? MSG.LOGBOOK_SESSION_EXPIRED : MSG.LOGBOOK_UNREACHABLE);
        remember(from, to, nowMs, out);
        return settle(out);
      }
      const payload = Array.isArray(body.data) ? { data: body.data, totalCount: body.data.length } : (body.data ?? {});
      const batch = payload.data ?? [];
      rows.push(...batch);
      if (batch.length < PAGE || rows.length >= (payload.totalCount ?? rows.length)) break;
    }
  } catch {
    const out = down(MSG.LOGBOOK_UNREACHABLE);
    remember(from, to, nowMs, out);
    return settle(out);
  }

  const dataRows = rows.filter((r) => !NON_DATA.has(r.resultName ?? ''));
  const formCounts: Record<string, number> = {};
  for (const r of dataRows) {
    const slug = r.tags?.[0] ?? r.resultName ?? 'unknown';
    formCounts[slug] = (formCounts[slug] ?? 0) + 1;
  }
  const win: LogbookWindow = { connection: 'up', message: MSG.LOGBOOK_UP, rows: dataRows, formCounts };
  remember(from, to, nowMs, win);
  return settle(win);
}

/* ------------------------------- helpers ------------------------------- */

const IST = '+05:30';

/**
 * Sample time. Entry time lags sampling by hours, so it is never used unflagged:
 *   "date+time"  date + time in plant time                 → exact
 *   "date+shift" date anchored to the shift's start hour   → entry-timed
 *   field name   Date.parse of that field                  → exact
 *   fallback     submission time                           → always entry-timed
 * `shiftStartHour` comes from the form mapping (e.g. { A: 6, B: 14, C: 22 }).
 */
export function rowTime(
  row: InsightRow, sampleTimeField: string | null, shiftStartHour: Record<string, number> = { A: 6, B: 14, C: 22 },
): { ms: number; entryTimed: boolean } | null {
  const res = row.result ?? {};
  const date = String(res['date'] ?? '').trim();
  const dayMs = date ? Date.parse(`${date}T00:00:00${IST}`) : NaN;
  if (sampleTimeField === 'date+time') {
    const time = String(res['time'] ?? '').trim();
    if (date && time) {
      const ms = Date.parse(`${date} ${time} ${IST}`);
      if (Number.isFinite(ms)) return { ms, entryTimed: false };
    }
    if (Number.isFinite(dayMs)) return { ms: dayMs, entryTimed: true };
  } else if (sampleTimeField === 'date+shift') {
    const shift = String(res['shift'] ?? '').trim().toUpperCase();
    if (Number.isFinite(dayMs)) {
      const h = shiftStartHour[shift];
      return { ms: dayMs + (h ?? 0) * 3_600_000, entryTimed: true };
    }
  } else if (sampleTimeField) {
    const ms = Date.parse(String(res[sampleTimeField] ?? ''));
    if (Number.isFinite(ms)) return { ms, entryTimed: false };
  }
  const ms = Date.parse(row.invocationTime ?? row.createdAt ?? '');
  return Number.isFinite(ms) ? { ms, entryTimed: true } : null;
}

/** Numeric coercion that refuses anything that is not a real number — blanks stay blank. */
export function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** Tests only: forget the session so the next call re-seeds from the environment. */
export function resetLogbookSession() {
  bearer = undefined;
  droppedReason = null;
  cache.length = 0;
  inflight.length = 0;
}

/* ---------------------------- raw insight pages ---------------------------- */

/** One logbook entry with its id and timestamps, as the engine returns it. */
export interface InsightEntry extends InsightRow { _id?: string; updatedAt?: string }

export type InsightPage =
  | { ok: true; rows: InsightEntry[]; total: number }
  | { ok: false; message: string };

/**
 * One page of the insight, NEWEST FIRST. The engine ignores every filter (dates, form) and
 * always returns all entries in this order, so a reader pages from the top until it is past
 * the time it needs. A rejected session is dropped, as everywhere in this client.
 */
export async function fetchInsightPage(page: number, env = loadEnv(), count = PAGE): Promise<InsightPage> {
  const auth = currentBearer(env);
  if (!auth) return { ok: false, message: droppedReason ?? MSG.LOGBOOK_NO_SESSION };
  const insightId = env.logbookInsightId;
  if (!insightId) return { ok: false, message: MSG.LOGBOOK_NOT_MAPPED };
  try {
    const res = await fetch(
      `${env.iosenseBase}/api/account/bruce/insightResult/fetch/paginated/${encodeURIComponent(insightId)}`,
      {
        method: 'PUT',
        headers: headers(env, auth),
        body: JSON.stringify({ insightID: insightId, pagination: { page, count } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    const body = (await res.json().catch(() => ({}))) as {
      success?: boolean; errors?: unknown; data?: { data?: InsightEntry[]; totalCount?: number } | InsightEntry[];
    };
    if (!body.success) {
      const authFail = isAuthFailure(res.status, body.errors);
      if (authFail) dropSession(MSG.LOGBOOK_SESSION_EXPIRED);
      return { ok: false, message: authFail ? MSG.LOGBOOK_SESSION_EXPIRED : MSG.LOGBOOK_UNREACHABLE };
    }
    const payload = Array.isArray(body.data) ? { data: body.data, totalCount: body.data.length } : (body.data ?? {});
    return { ok: true, rows: payload.data ?? [], total: payload.totalCount ?? 0 };
  } catch {
    return { ok: false, message: MSG.LOGBOOK_UNREACHABLE };
  }
}
