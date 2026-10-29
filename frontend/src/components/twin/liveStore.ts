'use client';

/**
 * The live store (mill-mimic-improvement-spec C11, polling edition — the user, 29 Oct 2026):
 * a plain module holding the last answer of each live endpoint, polled the way a control-room
 * display should poll a historian:
 *
 *   - at the DATA's cadence — every 10 s, which is how often the historian writes — not
 *     faster (nothing new to fetch) and not slower (then it is not live);
 *   - one request per endpoint however many panels show it: subscribers share the store;
 *   - never two in flight: a tick while a request is running is skipped, and a request that
 *     outlasts `timeoutMs` is abandoned;
 *   - paused while the tab is hidden, resumed the moment it is shown or the browser comes
 *     back online — a screen nobody looks at costs the plant nothing;
 *   - on failure, exponential backoff (interval × 2 … 60 s) with ±20 % jitter, so a hundred
 *     dashboards do not hammer a recovering backend in step; the last good answer stays on
 *     screen, judged by its own source timestamps;
 *   - staleness re-assessed every 250 ms FROM THE SOURCE TIMESTAMPS, so a frozen feed greys
 *     out even when no new message ever arrives;
 *   - a new snapshot is published only when something changed (new data, a quality
 *     transition, a status change), so React commits stay far under 4 per second.
 *
 * React binds with `useSyncExternalStore`: no state-management library (guide §1).
 */
import { useCallback, useSyncExternalStore } from 'react';
import { fetchJson } from '@/services/hsmApi';
import { POLL } from './twinSignals';

export type LiveStatus = 'connecting' | 'live' | 'retrying' | 'paused';

export interface LiveSnapshot<T> {
  data: T | null;
  /** When `data` was received (ms). */
  receivedAt: number | null;
  /** The last failure's message; null once a request succeeds. */
  error: string | null;
  status: LiveStatus;
  /** The clock the qualities are judged against, advanced every `assessMs`. */
  now: number;
  /** Bumps whenever the snapshot changes. */
  version: number;
}

interface Entry<T> {
  snap: LiveSnapshot<T>;
  subs: Set<() => void>;
  /** Signal timestamps and stale limits of the current data, for the 250 ms quality tick. */
  edges: { ts: number; staleAfterMs: number }[];
  extract: (data: T) => { ts: number | null; staleAfterMs: number }[];
  timer: ReturnType<typeof setTimeout> | null;
  assessTimer: ReturnType<typeof setInterval> | null;
  inflight: AbortController | null;
  failures: number;
  intervalMs: number;
}

const entries = new Map<string, Entry<unknown>>();
const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
const jitter = (ms: number) => ms * (0.8 + Math.random() * 0.4);

function publish<T>(e: Entry<T>, patch: Partial<LiveSnapshot<T>>) {
  e.snap = { ...e.snap, ...patch, version: e.snap.version + 1 };
  for (const s of e.subs) s();
}

/** Which qualities would flip between two clocks: a transition means a new snapshot. */
function qualityChanged(e: Entry<unknown>, from: number, to: number) {
  return e.edges.some((x) => (from - x.ts > x.staleAfterMs) !== (to - x.ts > x.staleAfterMs));
}

async function poll<T>(key: string, e: Entry<T>) {
  if (e.inflight || hidden()) return;
  const ctl = new AbortController();
  e.inflight = ctl;
  const kill = setTimeout(() => ctl.abort(), POLL.timeoutMs);
  try {
    const data = await fetchJson<T>(key, ctl.signal);
    if (ctl.signal.aborted) return;
    e.failures = 0;
    e.edges = e.extract(data).filter((x): x is { ts: number; staleAfterMs: number } => x.ts !== null);
    publish(e, { data, receivedAt: Date.now(), error: null, status: 'live', now: Date.now() });
  } catch (err) {
    /* Abandoned on purpose (unsubscribed, or past the timeout): not a failure of the backend. */
    if (ctl.signal.aborted && !ctl.signal.reason?.toString().includes('Timeout')) return;
    e.failures += 1;
    publish(e, { error: (err as Error).message, status: 'retrying', now: Date.now() });
  } finally {
    clearTimeout(kill);
    if (e.inflight === ctl) e.inflight = null;
    schedule(key, e);
  }
}

function schedule<T>(key: string, e: Entry<T>) {
  if (e.timer) clearTimeout(e.timer);
  if (!e.subs.size) return;
  if (hidden()) { if (e.snap.status !== 'paused') publish(e, { status: 'paused' }); return; }
  const wait = e.failures ? jitter(Math.min(POLL.backoffMaxMs, e.intervalMs * 2 ** e.failures)) : e.intervalMs;
  e.timer = setTimeout(() => { e.timer = null; void poll(key, e); }, wait);
}

function wake() {
  for (const [key, e] of entries) {
    if (!e.subs.size || hidden()) continue;
    /* Shown again: fetch now rather than at the next tick — the screen is being looked at. */
    e.failures = 0;
    if (e.timer) { clearTimeout(e.timer); e.timer = null; }
    void poll(key, e);
  }
}

let wired = false;
function wire() {
  if (wired || typeof document === 'undefined') return;
  wired = true;
  document.addEventListener('visibilitychange', () => {
    if (hidden()) for (const [key, e] of entries) schedule(key, e); else wake();
  });
  window.addEventListener('online', wake);
}

function entryFor<T>(key: string, intervalMs: number, extract: Entry<T>['extract']): Entry<T> {
  let e = entries.get(key) as Entry<T> | undefined;
  if (e) return e;
  e = {
    snap: { data: null, receivedAt: null, error: null, status: 'connecting', now: Date.now(), version: 0 },
    subs: new Set(), edges: [], extract, timer: null, assessTimer: null, inflight: null, failures: 0, intervalMs,
  };
  entries.set(key, e as Entry<unknown>);
  return e;
}

function subscribe<T>(key: string, e: Entry<T>, cb: () => void) {
  wire();
  e.subs.add(cb);
  if (e.subs.size === 1) {
    void poll(key, e);
    e.assessTimer = setInterval(() => {
      const now = Date.now();
      if (qualityChanged(e as Entry<unknown>, e.snap.now, now)) publish(e, { now });
    }, POLL.assessMs);
  }
  return () => {
    e.subs.delete(cb);
    if (e.subs.size) return;
    if (e.timer) { clearTimeout(e.timer); e.timer = null; }
    if (e.assessTimer) { clearInterval(e.assessTimer); e.assessTimer = null; }
    e.inflight?.abort();
    e.inflight = null;
  };
}

const EMPTY: LiveSnapshot<never> = { data: null, receivedAt: null, error: null, status: 'connecting', now: 0, version: 0 };

/**
 * A live endpoint, polled as above. `extract` lists the source timestamps in an answer and how
 * long each stays fresh, so the store can tell when a quality flips without a new message.
 */
export function useLive<T>(url: string | null, extract: (data: T) => { ts: number | null; staleAfterMs: number }[], intervalMs = POLL.intervalMs): LiveSnapshot<T> {
  const e = url ? entryFor<T>(url, intervalMs, extract) : null;
  /* One subscribe function per URL: a new one each render would make React unsubscribe and
     resubscribe every time, and each resubscribe starts a poll — a loop. */
  const sub = useCallback((cb: () => void) => (e && url ? subscribe(url, e, cb) : () => {}), [e, url]);
  const get = useCallback(() => (e ? e.snap : (EMPTY as LiveSnapshot<T>)), [e]);
  return useSyncExternalStore(sub, get, getEmpty as () => LiveSnapshot<T>);
}
const getEmpty = () => EMPTY;

/** Tests and the fixtures page: a snapshot that never polls. */
export const staticSnapshot = <T,>(data: T, now = Date.now()): LiveSnapshot<T> =>
  ({ data, receivedAt: now, error: null, status: 'live', now, version: 1 });
