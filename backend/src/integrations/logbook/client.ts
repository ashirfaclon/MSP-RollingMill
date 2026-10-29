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
 *
 * The engine filters with `filter: { tags: [form], startDate, endDate }` — singular `filter`.
 * The documented `filters` is ignored (every entry of every form comes back); tested 16 Oct
 * 2026. One tag per call (two return nothing); the dates are the submission time, not a
 * form's Date field.
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
  forms.clear();
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
    forms.clear();
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
  metadata?: Record<string, unknown>;
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

/** Entries for a window (by submission time). Date filtering is pushed down to the API. */
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
            filter: { startDate: new Date(from).toISOString(), endDate: new Date(to).toISOString() },
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
  forms.clear();
}

/* ---------------------------- one form's entries ---------------------------- */

/** One logbook entry with its id and timestamps, as the engine returns it. */
export interface InsightEntry extends InsightRow { _id?: string; updatedAt?: string }

export type FormRead =
  | { ok: true; rows: InsightEntry[] }
  | { ok: false; message: string };

/** One read of a form is shared this long — many viewers refreshing at once make one call. */
const FORM_FRESH_MS = 30_000;
const forms = new Map<string, { at: number; p: Promise<FormRead> }>();

/**
 * Every entry of one form submitted since `sinceMs`, newest first. Read fresh from the
 * logbook (nothing kept beyond 30 s), so an entry deleted or edited there is gone or changed
 * on the next read.
 */
export function fetchFormEntries(tag: string, sinceMs: number, env = loadEnv(), nowMs = Date.now()): Promise<FormRead> {
  const auth = currentBearer(env);
  if (!auth) return Promise.resolve({ ok: false, message: droppedReason ?? MSG.LOGBOOK_NO_SESSION });
  const insightId = env.logbookInsightId;
  if (!insightId) return Promise.resolve({ ok: false, message: MSG.LOGBOOK_NOT_MAPPED });
  // From the start of that day, so periods starting the same day share one read.
  const since = Math.floor(sinceMs / 86_400_000) * 86_400_000;
  const key = `${tag}|${since}`;
  const hit = forms.get(key);
  if (hit && nowMs - hit.at < FORM_FRESH_MS) return hit.p;
  const p = readForm(env, auth, insightId, tag, since);
  forms.set(key, { at: nowMs, p });
  // A failed read is not shared: the next request tries again.
  void p.then((r) => { if (!r.ok && forms.get(key)?.p === p) forms.delete(key); });
  return p;
}

async function readForm(env: Env, auth: string, insightId: string, tag: string, since: number): Promise<FormRead> {
  const rows: InsightEntry[] = [];
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
            filter: { tags: [tag], startDate: new Date(since).toISOString(), endDate: new Date(Date.now() + 86_400_000).toISOString() },
          }),
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
      const batch = payload.data ?? [];
      // Only this form's entries, whatever the engine sends.
      rows.push(...batch.filter((r) => String((r.tags ?? [])[0] ?? r.resultName ?? '') === tag));
      if (batch.length < PAGE || page * PAGE >= (payload.totalCount ?? 0)) break;
    }
    return { ok: true, rows };
  } catch {
    return { ok: false, message: MSG.LOGBOOK_UNREACHABLE };
  }
}

/* ------------------------------ writing entries ------------------------------ */

export type FormWrite =
  | { ok: true; saved: number; added: number; updated: number; removed: number }
  | { ok: false; saved: number; message: string };

/** Submissions this far back are read before a save (the dashboard's forms are all newer). */
const WRITE_LOOK_BACK_MS = 3 * 365 * 86_400_000;

/**
 * Save entries to one form as a table with one row per key (the user, 29 Oct 2026 — the form is the
 * dashboard's database): `keyOf` gives an entry's key (the plan's date, CA inputs' month, …).
 *   - a key already in the form: its newest row is updated in place (functionID updateInsightResult,
 *     PUT …/insightResult/update/singleInsightResult, mode "set" — the whole `result` replaced), and
 *     any older rows of the same key are deleted (…/insightResult/delete/{insight}/{id}). The update
 *     is stamped as the logbook app stamps its own corrections — metadata.editedAt, editedBy and the
 *     `edits` history (last 20): the app's Records page only re-reads a row whose editedAt moved;
 *   - a new key: one entry added (addInsightResult, POST …/insightResult/add), in the shape the
 *     logbook app submits — `resultName` and `tags` = the form's tag, the values in `result`,
 *     `metadata.formId`; applicationType "Insight", no applicationID (it is cast to an ObjectId).
 * The form is read fresh first; if that read fails nothing is written, so a save never doubles rows.
 * Stops at the first refusal and says how many were saved. The form's read cache is cleared after.
 */
export async function saveFormEntries(
  formId: string, results: Record<string, unknown>[], keyOf: (result: Record<string, unknown>) => string,
  filledBy: string, env = loadEnv(),
): Promise<FormWrite> {
  const auth = currentBearer(env);
  if (!auth) return { ok: false, saved: 0, message: droppedReason ?? MSG.LOGBOOK_NO_SESSION };
  const insightId = env.logbookInsightId;
  if (!insightId) return { ok: false, saved: 0, message: MSG.LOGBOOK_NOT_MAPPED };
  const tag = formId.replace('__', '/');
  const metadata = { formId, source: 'msp-steel-logbook', filledBy, dataSource: [] };
  let saved = 0; let added = 0; let updated = 0; let removed = 0;
  const refused = (status: number, errors: unknown) => {
    const authFail = isAuthFailure(status, errors);
    if (authFail) dropSession(MSG.LOGBOOK_SESSION_EXPIRED);
    return { ok: false as const, saved, message: authFail ? MSG.LOGBOOK_SESSION_EXPIRED : `${MSG.LOGBOOK_WRITE_REFUSED}: ${String(errors ?? status)}` };
  };
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${env.iosenseBase}/api/account/bruce/insightResult/${path}`, {
      method, headers: headers(env, auth), body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const out = (await res.json().catch(() => ({}))) as { success?: boolean; errors?: unknown };
    return { res, out };
  };
  try {
    const read = await readForm(env, auth, insightId, tag, Math.floor((Date.now() - WRITE_LOOK_BACK_MS) / 86_400_000) * 86_400_000);
    if (!read.ok) return { ok: false, saved: 0, message: read.message };
    // Each key's rows, newest first.
    const at = (r: InsightEntry) => String(r.createdAt ?? r.invocationTime ?? '');
    const rows = new Map<string, InsightEntry[]>();
    for (const r of [...read.rows].sort((a, b) => at(b).localeCompare(at(a)))) {
      const k = keyOf(r.result ?? {});
      if (!k || !r._id) continue;
      rows.set(k, [...(rows.get(k) ?? []), r]);
    }
    for (const result of results) {
      const [row, ...older] = rows.get(keyOf(result)) ?? [];
      if (row) {
        const prev = row.metadata ?? {};
        const now = new Date().toISOString();
        const fields = Object.keys(result).filter((k) => String(result[k] ?? '') !== String(row.result?.[k] ?? ''));
        const edits = Array.isArray(prev.edits) ? prev.edits : [];
        const stamped = { ...prev, ...metadata, editedAt: now, editedBy: filledBy, edits: [...edits, { at: now, by: filledBy, fields }].slice(-20) };
        const { res, out } = await call('PUT', 'update/singleInsightResult', { mode: 'set', updatedFields: { _id: row._id, insightID: insightId, result, metadata: stamped } });
        if (!out.success) return refused(res.status, out.errors);
        updated += 1;
        for (const o of older) {
          const d = await call('DELETE', `delete/${encodeURIComponent(insightId)}/${encodeURIComponent(o._id!)}`);
          if (!d.out.success && d.res.status !== 404) return refused(d.res.status, d.out.errors);
          removed += 1;
        }
      } else {
        const { res, out } = await call('POST', 'add', {
          insightID: insightId, resultName: tag, applicationType: 'Insight', tags: [tag], result, metadata, invocationTime: new Date().toISOString(),
        });
        if (!out.success) return refused(res.status, out.errors);
        added += 1;
      }
      saved += 1;
    }
    return { ok: true, saved, added, updated, removed };
  } catch {
    return { ok: false, saved, message: MSG.LOGBOOK_UNREACHABLE };
  } finally {
    for (const k of forms.keys()) if (k.startsWith(`${tag}|`)) forms.delete(k);
  }
}

/** Delete one row of a form by its id (…/insightResult/delete/{insight}/{id}); gone already counts as done. */
export async function deleteFormEntry(formId: string, id: string, env = loadEnv()): Promise<{ ok: boolean; message?: string }> {
  const auth = currentBearer(env);
  if (!auth) return { ok: false, message: droppedReason ?? MSG.LOGBOOK_NO_SESSION };
  const insightId = env.logbookInsightId;
  if (!insightId) return { ok: false, message: MSG.LOGBOOK_NOT_MAPPED };
  const tag = formId.replace('__', '/');
  try {
    const res = await fetch(`${env.iosenseBase}/api/account/bruce/insightResult/delete/${encodeURIComponent(insightId)}/${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: headers(env, auth), signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const out = (await res.json().catch(() => ({}))) as { success?: boolean; errors?: unknown };
    return out.success || res.status === 404 ? { ok: true } : { ok: false, message: String(out.errors ?? res.status) };
  } catch {
    return { ok: false, message: MSG.LOGBOOK_UNREACHABLE };
  } finally {
    for (const k of forms.keys()) if (k.startsWith(`${tag}|`)) forms.delete(k);
  }
}

/** Several forms at once (one call each); down if any is. */
export async function fetchFormsEntries(tags: string[], sinceMs: number, env = loadEnv(), nowMs = Date.now()): Promise<FormRead> {
  const reads = await Promise.all(tags.map((t) => fetchFormEntries(t, sinceMs, env, nowMs)));
  const failed = reads.find((r): r is Extract<FormRead, { ok: false }> => !r.ok);
  return failed ?? { ok: true, rows: reads.flatMap((r) => (r.ok ? r.rows : [])) };
}
