'use client';

/**
 * The app session. IOsense opens the app with a one-time SSO token in the URL (`?token=`,
 * valid 60 s, single use). It is exchanged ONCE with the backend (POST /api/auth/sso) for an
 * app session, kept in sessionStorage for this tab, and sent as `Authorization: Bearer …`
 * on every API call. The token is removed from the address bar as soon as it is read.
 *
 * The backend enforces access on every route; this module only drives the sign-in screen.
 *
 * Per-mill access (the user, 27 Nov 2026): the session carries the mills the person's IOsense role opens; the mill
 * menu and the routes follow it. Opening or refreshing the dashboard asks the backend again (GET /api/auth/session),
 * which re-reads the role from IOsense and may hand back a new session.
 */
import type { SessionResponse, SsoExchangeResponse } from '@contracts';
import { API_BASE } from '@/services/apiBase';
import { MILLS, type MillId } from '@/config/navigation';

const KEY = 'msp.rollingmill.session.v1';

interface Stored { token: string; expiresAt: string; mills?: MillId[] }

export type AuthState =
  | { status: 'checking' }
  | { status: 'ok' }
  | { status: 'blocked'; reason: 'missing' | 'expired' | 'link-used' | 'denied' | 'no-mill' | 'unavailable'; message: string };

/* ------------------------------ storage ------------------------------ */

function read(): Stored | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Stored | null;
    return s && Date.parse(s.expiresAt) > Date.now() ? s : null;
  } catch {
    return null;
  }
}

function write(s: Stored | null) {
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch { /* storage blocked — the session lives for this page load only */ }
}

let memory: Stored | null = null;

/** The mills this person may see, in menu order; every mill with sign-in off. */
let mills: MillId[] = MILLS.map((m) => m.id);
export const allowedMills = (): MillId[] => mills;
export const canSee = (mill: MillId) => mills.includes(mill);
const keepMills = (m: readonly string[] | null | undefined) => {
  mills = m ? MILLS.map((x) => x.id).filter((id) => m.includes(id)) : MILLS.map((x) => x.id);
};

/** The `Authorization` header for API calls, or none. */
export function authHeader(): Record<string, string> {
  const s = memory ?? read();
  return s ? { Authorization: `Bearer ${s.token}` } : {};
}

/* ------------------------ state, shared app-wide ------------------------ */

let state: AuthState = { status: 'checking' };
const listeners = new Set<(s: AuthState) => void>();

function set(next: AuthState) {
  state = next;
  for (const l of listeners) l(state);
}

export function subscribe(l: (s: AuthState) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const getState = () => state;

/** Any API call answered 401: the session is gone — back to the sign-in screen. */
export function sessionRejected() {
  memory = null;
  write(null);
  set({ status: 'blocked', reason: 'expired', message: 'Your session has ended — open the dashboard again from IOsense.' });
}

/* ------------------------------ sign-in ------------------------------ */

/** Read `?token=` once and remove it from the address bar (and from history). */
function takeTokenFromUrl(): string | null {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token');
  if (token === null) return null;
  url.searchParams.delete('token');
  window.history.replaceState(window.history.state, '', url.toString());
  return token.trim() || null;
}

async function call(path: string, init: RequestInit = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store', ...init });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

const BLOCKED: Record<Exclude<AuthState, { status: 'checking' | 'ok' }>['reason'], string> = {
  missing: 'This dashboard opens from IOsense. Open it from your IOsense apps to sign in.',
  expired: 'Your session has ended — open the dashboard again from IOsense.',
  'link-used': 'The sign-in link has expired or was already used — open the dashboard again from IOsense.',
  denied: 'Your IOsense organisation does not have access to this dashboard.',
  'no-mill': 'No mill is assigned to your IOsense role — contact your admin.',
  unavailable: 'The sign-in service could not be reached — try again in a moment.',
};

/** A refused sign-in or session, by the backend's error code. */
function blocked(r: { status: number; body: Record<string, unknown> }) {
  const code = String(r.body.error ?? '');
  const reason = code === 'no_mill_access' ? 'no-mill' : r.status === 403 ? 'denied' : r.status === 401 ? 'link-used' : 'unavailable';
  // "Could not check your access" (IOsense did not answer) says so, rather than the generic line.
  const message = code === 'access_unavailable' && typeof r.body.message === 'string' ? r.body.message : BLOCKED[reason];
  return set({ status: 'blocked', reason, message });
}

let started: Promise<void> | null = null;

/** Decide once per page load (idempotent — safe under React's double effects). */
export function startAuth(): Promise<void> {
  started ??= run();
  return started;
}

async function run() {
  try {
    const sso = takeTokenFromUrl();
    if (sso) {
      const r = await call('/api/auth/sso', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: sso }),
      });
      if (r.status === 200) {
        const s = r.body as unknown as SsoExchangeResponse;
        keepMills(s.access?.mills);
        memory = { token: s.sessionToken, expiresAt: s.expiresAt, mills };
        write(memory);
        return set({ status: 'ok' });
      }
      return blocked(r);
    }

    // No token: an existing session for this tab, or a backend with sign-in turned off.
    const had = read();
    const r = await call('/api/auth/session', { headers: authHeader() });
    if (r.status === 200 && (r.body as unknown as SessionResponse).authenticated) {
      const s = r.body as unknown as SessionResponse;
      keepMills(s.access ? s.access.mills : null);
      // The role changed since sign-in: the backend hands a new session with the new mills.
      memory = had ? { ...had, token: s.sessionToken ?? had.token, mills } : null;
      if (memory) write(memory);
      return set({ status: 'ok' });
    }
    if (r.status === 401) {
      write(null);
      const reason = had ? 'expired' : 'missing';
      return set({ status: 'blocked', reason, message: BLOCKED[reason] });
    }
    if (r.status === 403) write(null);
    blocked(r);
  } catch {
    set({ status: 'blocked', reason: 'unavailable', message: BLOCKED.unavailable });
  }
}
