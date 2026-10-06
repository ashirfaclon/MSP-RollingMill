/**
 * Process historian reads. Ported from the pellet/CPP client (see
 * BACKEND_CONNECTIVITY_HANDOVER.md §3).
 *
 * Honesty rule: when the historian is not configured or unreachable, every requested tag
 * comes back as an EMPTY series with `connection: 'down'` and a stated reason. Nothing is
 * ever substituted — downstream renders empty as NA.
 *
 * Three read shapes, chosen per consumer:
 *   fetchWindow  aggregateWindow(mean) — trends and window averages
 *   fetchLatest  last(), unaggregated  — "what is the instrument reading now"
 *   fetchRaw     no aggregation        — energy integration (an average cannot be integrated)
 */
import type { Env } from '../../config/env';
import { MSG } from '../../shared/messages';
import { FRESH_MS, bucketSeconds, collect, esc, fluxTime, lastWrite, queryApi, type TagPoint } from '../influx';
import { mappedOnly, type TagDef } from './tags';

export interface HistorianWindow {
  connection: 'up' | 'down';
  message: string;
  /** Tag key → points. Present for EVERY requested tag, so callers never null-check the map. */
  series: Record<string, TagPoint[]>;
  bucketMs: number;
}

export const historianConfigured = (env: Env): boolean =>
  Boolean(env.influxUrl && env.influxBucket && (env.influxToken || env.influxUser));

const tokenOf = (env: Env) => env.influxToken ?? `${env.influxUser}:${env.influxPassword ?? ''}`;

type Row = { Unit: string; Group?: string; _field: string; _value: number; _time: string };

/** Unit + Group + field — a field name alone identifies nothing on this historian. */
const coordKey = (unit: string, group: string | undefined, field: string) => `${unit} | ${group ?? ''} | ${field}`;

function byMeasurement(defs: TagDef[]): Map<string, TagDef[]> {
  const m = new Map<string, TagDef[]>();
  for (const d of defs) m.set(d.measurement, [...(m.get(d.measurement) ?? []), d]);
  return m;
}

/** OR-chain, not contains() — measured faster on this server. */
function orChain(defs: TagDef[]): string {
  return defs
    .map((d) => (d.group
      ? `(r.Unit == "${esc(d.unitTag)}" and r.Group == "${esc(d.group)}" and r._field == "${esc(d.field)}")`
      : `(r.Unit == "${esc(d.unitTag)}" and r._field == "${esc(d.field)}")`))
    .join(' or ');
}

function matchDef(index: Map<string, TagDef>, o: Row): TagDef | undefined {
  return index.get(coordKey(o.Unit, o.Group, o._field)) ?? index.get(coordKey(o.Unit, undefined, o._field));
}

/** Query each measurement's tags and hand every matched row to `onRow`. */
async function readTags(
  env: Env, defs: TagDef[], timeoutMs: number,
  pipeline: (measurement: string, chain: string) => string,
  onRow: (def: TagDef, t: number, v: number | null) => void,
): Promise<void> {
  const q = queryApi(env.influxUrl!, tokenOf(env), env.influxOrg, timeoutMs);
  await Promise.all([...byMeasurement(defs)].map(async ([measurement, group]) => {
    const index = new Map(group.map((d) => [coordKey(d.unitTag, d.group, d.field), d]));
    const rows = await collect<Row>(q, pipeline(measurement, orChain(group)));
    for (const o of rows) {
      const def = matchDef(index, o);
      if (def) onRow(def, Date.parse(o._time), Number.isFinite(o._value) ? o._value * def.scale : null);
    }
  }));
}

function emptySeries(defs: TagDef[]): Record<string, TagPoint[]> {
  return Object.fromEntries(defs.map((d) => [d.key, []]));
}

/**
 * Window of bucket-averaged points. `fn: mean`, because a bucket's mean is the
 * energy-correct representative of a power reading; `last` would make the average depend
 * on where bucket boundaries fall.
 *
 * `leadInMs` extends the QUERY, not the window: it pulls readings from before the window so
 * a tag whose feed paused earlier is still carried into it. Rounded to whole buckets.
 */
export async function fetchWindow(
  env: Env, fromMs: number, toMs: number, requested: TagDef[], leadInMs = 0,
): Promise<HistorianWindow> {
  const bucketS = bucketSeconds(fromMs, toMs);
  const bucketMs = bucketS * 1000;
  const empty = emptySeries(requested);
  const defs = mappedOnly(requested);

  if (defs.length === 0) return { connection: 'up', message: MSG.HISTORIAN_NO_TAGS, series: empty, bucketMs };
  if (!historianConfigured(env)) return { connection: 'down', message: MSG.HISTORIAN_NOT_CONFIGURED, series: empty, bucketMs };

  const leadMs = Math.ceil(leadInMs / bucketMs) * bucketMs;
  try {
    const out = emptySeries(requested);
    await readTags(env, defs, 60_000, (m, chain) => `
from(bucket: "${esc(env.influxBucket!)}")
  |> range(start: ${fluxTime(fromMs - leadMs)}, stop: ${fluxTime(toMs)})
  |> filter(fn: (r) => r._measurement == "${esc(m)}")
  |> filter(fn: (r) => ${chain})
  |> aggregateWindow(every: ${bucketS}s, fn: mean, createEmpty: false)
  |> keep(columns: ["Unit", "Group", "_field", "_value", "_time"])`,
    (def, t, v) => { out[def.key].push({ t, v }); });
    for (const k of Object.keys(out)) out[k].sort((a, b) => a.t - b.t);
    return { connection: 'up', message: MSG.HISTORIAN_UP, series: out, bucketMs };
  } catch {
    return { connection: 'down', message: MSG.HISTORIAN_UNREACHABLE, series: empty, bucketMs };
  }
}

/**
 * The last raw point of each tag INSIDE the window. Bounded by the window, not by "now",
 * so a historical view shows that period's last reading rather than leaking today's.
 */
export async function fetchLatest(
  env: Env, fromMs: number, toMs: number, requested: TagDef[],
): Promise<{ connection: 'up' | 'down'; message: string; latest: Record<string, TagPoint | null> }> {
  const empty: Record<string, TagPoint | null> = Object.fromEntries(requested.map((d) => [d.key, null]));
  const defs = mappedOnly(requested);
  if (defs.length === 0) return { connection: 'up', message: MSG.HISTORIAN_NO_TAGS, latest: empty };
  if (!historianConfigured(env)) return { connection: 'down', message: MSG.HISTORIAN_NOT_CONFIGURED, latest: empty };
  try {
    const out = { ...empty };
    await readTags(env, defs, 60_000, (m, chain) => `
from(bucket: "${esc(env.influxBucket!)}")
  |> range(start: ${fluxTime(fromMs)}, stop: ${fluxTime(toMs)})
  |> filter(fn: (r) => r._measurement == "${esc(m)}")
  |> filter(fn: (r) => ${chain})
  |> last()
  |> keep(columns: ["Unit", "Group", "_field", "_value", "_time"])`,
    (def, t, v) => { out[def.key] = { t, v }; });
    return { connection: 'up', message: MSG.HISTORIAN_UP, latest: out };
  } catch {
    return { connection: 'down', message: MSG.HISTORIAN_UNREACHABLE, latest: empty };
  }
}

/** Raw, unaggregated points — what energy and run-time integration need. 300 s timeout. */
export async function fetchRaw(
  env: Env, fromMs: number, toMs: number, requested: TagDef[],
): Promise<HistorianWindow> {
  const empty = emptySeries(requested);
  const defs = mappedOnly(requested);
  if (defs.length === 0) return { connection: 'up', message: MSG.HISTORIAN_NO_TAGS, series: empty, bucketMs: 0 };
  if (!historianConfigured(env)) return { connection: 'down', message: MSG.HISTORIAN_NOT_CONFIGURED, series: empty, bucketMs: 0 };
  try {
    const out = emptySeries(requested);
    await readTags(env, defs, 300_000, (m, chain) => `
from(bucket: "${esc(env.influxBucket!)}")
  |> range(start: ${fluxTime(fromMs)}, stop: ${fluxTime(toMs)})
  |> filter(fn: (r) => r._measurement == "${esc(m)}")
  |> filter(fn: (r) => ${chain})
  |> keep(columns: ["Unit", "Group", "_field", "_value", "_time"])`,
    (def, t, v) => { out[def.key].push({ t, v }); });
    for (const k of Object.keys(out)) out[k].sort((a, b) => a.t - b.t);
    return { connection: 'up', message: MSG.HISTORIAN_UP, series: out, bucketMs: 0 };
  } catch {
    return { connection: 'down', message: MSG.HISTORIAN_UNREACHABLE, series: empty, bucketMs: 0 };
  }
}

/* ------------------------------ discovery ------------------------------ */

export interface HistorianProbe {
  connection: 'up' | 'down';
  configured: boolean;
  message: string;
  latencyMs: number | null;
  /** Measurements that published in the lookback — how HSM tags get found. */
  measurements: string[];
  /** When this mill's measurement last wrote (within a day); null if it did not. */
  lastReadingAt: number | null;
  /** Wrote within FRESH_MS. Reachable-but-silent is not healthy. */
  fresh: boolean;
}

/**
 * Connection test that also answers "what is in there": the measurements that published
 * in the last day, and when this mill's measurement last wrote. Schema metadata plus a
 * pushed-down last(), so it is cheap on a large bucket.
 */
export async function probeHistorian(
  env: Env, millMeasurement: string | null = null, lookbackH = 24, timeoutMs = 15_000, nowMs = Date.now(),
): Promise<HistorianProbe> {
  const none = { measurements: [], lastReadingAt: null, fresh: false };
  if (!historianConfigured(env)) {
    return { connection: 'down', configured: false, message: MSG.HISTORIAN_NOT_CONFIGURED, latencyMs: null, ...none };
  }
  const t0 = Date.now();
  try {
    const q = queryApi(env.influxUrl!, tokenOf(env), env.influxOrg, timeoutMs);
    const [rows, lastReadingAt] = await Promise.all([
      collect<{ _value: string }>(q, `
import "influxdata/influxdb/schema"
schema.measurements(bucket: "${esc(env.influxBucket!)}", start: -${Math.round(lookbackH)}h)`),
      millMeasurement
        ? lastWrite(q, env.influxBucket!, `r._measurement == "${esc(millMeasurement)}"`, `${Math.round(lookbackH)}h`)
        : Promise.resolve(null),
    ]);
    const fresh = millMeasurement ? lastReadingAt !== null && nowMs - lastReadingAt <= FRESH_MS : true;
    return {
      connection: 'up', configured: true, message: fresh ? MSG.HISTORIAN_UP : MSG.HISTORIAN_STALE,
      latencyMs: Date.now() - t0, measurements: rows.map((r) => r._value).sort(), lastReadingAt, fresh,
    };
  } catch {
    return { connection: 'down', configured: true, message: MSG.HISTORIAN_UNREACHABLE, latencyMs: null, ...none };
  }
}

export interface MeasurementCatalogue {
  connection: 'up' | 'down';
  message: string;
  measurement: string;
  units: string[];
  groups: string[];
  fields: string[];
}

/** Units, Groups and fields published under one measurement — for building tag defs. */
export async function catalogue(env: Env, measurement: string, lookbackH = 24): Promise<MeasurementCatalogue> {
  const base = { measurement, units: [], groups: [], fields: [] };
  if (!historianConfigured(env)) return { connection: 'down', message: MSG.HISTORIAN_NOT_CONFIGURED, ...base };
  try {
    const q = queryApi(env.influxUrl!, tokenOf(env), env.influxOrg, 30_000);
    const b = esc(env.influxBucket!);
    const m = esc(measurement);
    const tagValues = (tag: string) => collect<{ _value: string }>(q, `
import "influxdata/influxdb/schema"
schema.tagValues(bucket: "${b}", tag: "${tag}", predicate: (r) => r._measurement == "${m}", start: -${lookbackH}h)`);
    const [units, groups, fields] = await Promise.all([
      tagValues('Unit'),
      tagValues('Group'),
      collect<{ _value: string }>(q, `
import "influxdata/influxdb/schema"
schema.measurementFieldKeys(bucket: "${b}", measurement: "${m}", start: -${lookbackH}h)`),
    ]);
    const vals = (rows: { _value: string }[]) => rows.map((r) => r._value).sort();
    return { connection: 'up', message: MSG.HISTORIAN_UP, measurement, units: vals(units), groups: vals(groups), fields: vals(fields) };
  } catch {
    return { connection: 'down', message: MSG.HISTORIAN_UNREACHABLE, ...base };
  }
}
