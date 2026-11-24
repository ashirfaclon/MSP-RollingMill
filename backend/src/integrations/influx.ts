/**
 * Shared Flux plumbing for both historians (process and EMS). The clients stay separate —
 * one per instrument — but the bucket rule, escaping and row collection are identical by
 * design, so a chart from either source over the same window has the same resolution.
 */
import http from 'node:http';
import https from 'node:https';
import { InfluxDB, type QueryApi } from '@influxdata/influxdb-client';

/** One reading. `v` is null when the historian stored something that is not a number. */
export interface TagPoint { t: number; v: number | null }

/** Identifiers only ever come from checked-in definitions, never from user input. */
export const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/**
 * Bucket width: ~500 points per series, never under 60 s.
 *
 * The floor is not cosmetic — minute accumulation Σ(rate/60) only equals Σ(rate × Δt) when
 * Δt really is a minute, and it puts tags on different cadences onto one time base.
 */
export function bucketSeconds(fromMs: number, toMs: number): number {
  const spanS = Math.max(60, (toMs - fromMs) / 1000);
  return Math.max(60, Math.ceil(spanS / 500 / 60) * 60);
}

/** Flux wants RFC3339 or nanoseconds; nanoseconds avoid any timezone reading. */
export const fluxTime = (ms: number) => `time(v: ${Math.round(ms) * 1_000_000})`;

/*
 * Guarding the historian (the user, 25 Nov 2026). The plant's Influx is shared by several apps on this server and
 * stopped accepting connections twice in a day; this backend alone held hundreds of connections to it, because every
 * query made a new client (and so new connections), identical queries ran once per screen, nothing capped how many
 * ran at once, and each waited up to 2–3 minutes while Influx was down. Every query goes through `collect`, so:
 *   one client and one small connection pool per server, reused (keep-alive, at most MAX_SOCKETS);
 *   at most MAX_RUNNING queries at a time per server; the rest wait their turn, and give up after MAX_WAIT_MS;
 *   identical queries share one answer — in flight, and for SHARE_MS after;
 *   after BREAK_AFTER failures in a row the server is left alone for BREAK_MS: queries fail at once with
 *   "unavailable" (each screen says so) instead of piling up; then one query tries again;
 *   no query waits longer than MAX_TIMEOUT_MS.
 */
const MAX_SOCKETS = 6;
const MAX_RUNNING = 4;
const MAX_WAIT_MS = 20_000;
const SHARE_MS = 30_000;
const BREAK_AFTER = 3;
const BREAK_MS = 30_000;
const MAX_TIMEOUT_MS = 45_000;

const agents = new Map<string, http.Agent>();
const clients = new Map<string, QueryApi>();
/** Which server a client queries — the key its limits and breaker are kept under. */
const serverOf = new WeakMap<QueryApi, string>();

export function queryApi(url: string, token: string, org: string | null, timeoutMs: number): QueryApi {
  const timeout = Math.min(timeoutMs, MAX_TIMEOUT_MS);
  const key = `${url}|${token}|${org ?? ''}|${timeout}`;
  const hit = clients.get(key);
  if (hit) return hit;
  const server = new URL(url).origin;
  let agent = agents.get(server);
  if (!agent) {
    const opts = { keepAlive: true, maxSockets: MAX_SOCKETS, maxFreeSockets: MAX_SOCKETS };
    agent = server.startsWith('https') ? new https.Agent(opts) : new http.Agent(opts);
    agents.set(server, agent);
  }
  const q = new InfluxDB({ url, token, timeout, transportOptions: { agent } }).getQueryApi(org ?? '');
  clients.set(key, q);
  serverOf.set(q, server);
  return q;
}

/** Per server: queries running, those waiting, failures in a row, and until when it is left alone. */
interface Guard { running: number; waiting: (() => void)[]; failures: number; openUntil: number }
const guards = new Map<string, Guard>();
const guardOf = (server: string) => {
  let g = guards.get(server);
  if (!g) { g = { running: 0, waiting: [], failures: 0, openUntil: 0 }; guards.set(server, g); }
  return g;
};
const shared = new Map<string, { at: number; p: Promise<unknown> }>();

export class HistorianUnavailable extends Error {
  constructor(why: string) { super(`Historian unavailable: ${why}`); this.name = 'HistorianUnavailable'; }
}

/** A turn to query `server`: now if fewer than MAX_RUNNING are running, else in order — or give up after MAX_WAIT_MS. */
function turn(g: Guard): Promise<void> {
  if (g.running < MAX_RUNNING) { g.running += 1; return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    const go = () => { clearTimeout(timer); g.running += 1; resolve(); };
    const timer = setTimeout(() => {
      const i = g.waiting.indexOf(go);
      if (i >= 0) g.waiting.splice(i, 1);
      reject(new HistorianUnavailable('too many queries waiting'));
    }, MAX_WAIT_MS);
    g.waiting.push(go);
  });
}
function done(g: Guard) {
  g.running -= 1;
  g.waiting.shift()?.();
}

/** Tests only. */
export function resetInfluxGuards() { guards.clear(); shared.clear(); }

/** A source is fresh if it wrote within this long. Reachable-but-silent must not read as healthy. */
export const FRESH_MS = 15 * 60_000;

/**
 * When a filtered set of series last wrote, within `lookback`. `last()` per series is
 * pushed down to storage, so this stays cheap on a large measurement.
 */
export async function lastWrite(q: QueryApi, bucket: string, predicate: string, lookback: string): Promise<number | null> {
  const rows = await collect<{ _time: string }>(q, `
from(bucket: "${esc(bucket)}")
  |> range(start: -${lookback})
  |> filter(fn: (r) => ${predicate})
  |> last()
  |> keep(columns: ["_time"])
  |> group()
  |> max(column: "_time")`);
  const t = rows[0] ? Date.parse(rows[0]._time) : NaN;
  return Number.isFinite(t) ? t : null;
}

/**
 * Run a Flux query and collect every row as a plain object — through the server's guard (above): shared with an
 * identical query, in turn, and not at all while the server is being left alone.
 */
export function collect<T = Record<string, unknown>>(q: QueryApi, flux: string, nowMs = Date.now()): Promise<T[]> {
  const server = serverOf.get(q) ?? 'default';
  const key = `${server}|${flux}`;
  const hit = shared.get(key);
  if (hit && nowMs - hit.at < SHARE_MS) return hit.p as Promise<T[]>;
  const g = guardOf(server);
  if (g.openUntil > nowMs) return Promise.reject(new HistorianUnavailable('not answering — retrying shortly'));
  const p = turn(g).then(() => run<T>(q, flux).then(
    (rows) => { g.failures = 0; g.openUntil = 0; return rows; },
    (err) => {
      g.failures += 1;
      if (g.failures >= BREAK_AFTER) g.openUntil = Date.now() + BREAK_MS;
      throw err;
    },
  ).finally(() => done(g)));
  shared.set(key, { at: nowMs, p });
  // A failed answer is not kept: the next request asks again (unless the server is being left alone).
  p.catch(() => { if (shared.get(key)?.p === p) shared.delete(key); });
  if (shared.size > 500) shared.delete(shared.keys().next().value!);
  return p;
}

function run<T>(q: QueryApi, flux: string): Promise<T[]> {
  const rows: T[] = [];
  return new Promise((resolve, reject) => {
    q.queryRows(flux, {
      next(row, meta) { rows.push(meta.toObject(row) as T); },
      error: reject,
      complete: () => resolve(rows),
    });
  });
}
