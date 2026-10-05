/**
 * Shared Flux plumbing for both historians (process and EMS). The clients stay separate —
 * one per instrument — but the bucket rule, escaping and row collection are identical by
 * design, so a chart from either source over the same window has the same resolution.
 */
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

export function queryApi(url: string, token: string, org: string | null, timeoutMs: number): QueryApi {
  return new InfluxDB({ url, token, timeout: timeoutMs }).getQueryApi(org ?? '');
}

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

/** Run a Flux query and collect every row as a plain object. */
export function collect<T = Record<string, unknown>>(q: QueryApi, flux: string): Promise<T[]> {
  const rows: T[] = [];
  return new Promise((resolve, reject) => {
    q.queryRows(flux, {
      next(row, meta) { rows.push(meta.toObject(row) as T); },
      error: reject,
      complete: () => resolve(rows),
    });
  });
}
