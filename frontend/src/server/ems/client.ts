/**
 * Electrical EMS reads — a SEPARATE InfluxDB from the process historian, so a separate
 * client. Ported from the pellet/CPP emsClient (handover §3.7).
 *
 * Shape: ONE measurement, `ems_power`; every reading keyed on the equipment `name` tag,
 * load in field `value`. Always filtered on `data_type == "equipment"` as well: the EMS
 * writes per-equipment rows, per-section rollups and a plant summary into the same
 * measurement, and the rollups reuse names — without the filter a rollup is double-counted
 * against its own members.
 *
 * This is where HSM run hours come from once the stand-drive feeders are identified: raw
 * readings (never averaged — they are integrated) into models/operating.ts.
 */
import type { Env } from '../env';
import { MSG } from '../sources';
import { FRESH_MS, collect, esc, fluxTime, lastWrite, queryApi, type TagPoint } from '../influx';

export interface EmsDef {
  key: string;
  /** Equipment `name` tag exactly as the EMS publishes it. */
  name: string;
  label: string;
  mapped: boolean;
}

/** HSM feeders — none confirmed yet; found via `GET /api/ems/equipment`. */
export const HSM_EMS: EmsDef[] = [];

export interface EmsWindow {
  connection: 'up' | 'down';
  message: string;
  series: Record<string, TagPoint[]>;
}

export const emsConfigured = (env: Env): boolean =>
  Boolean(env.emsInfluxUrl && env.emsInfluxBucket && env.emsInfluxToken);

/** Raw readings for a set of feeders. `leadInMs` extends the query, not the window. */
export async function fetchEmsRaw(
  env: Env, fromMs: number, toMs: number, requested: EmsDef[], leadInMs = 0,
): Promise<EmsWindow> {
  const empty: Record<string, TagPoint[]> = Object.fromEntries(requested.map((d) => [d.key, []]));
  const defs = requested.filter((d) => d.mapped);
  if (defs.length === 0) return { connection: 'up', message: MSG.EMS_NO_TAGS, series: empty };
  if (!emsConfigured(env)) return { connection: 'down', message: MSG.EMS_NOT_CONFIGURED, series: empty };

  try {
    const q = queryApi(env.emsInfluxUrl!, env.emsInfluxToken!, env.emsInfluxOrg, 60_000);
    const byName = new Map(defs.map((d) => [d.name, d]));
    const names = defs.map((d) => `r.name == "${esc(d.name)}"`).join(' or ');
    const rows = await collect<{ name: string; _value: number; _time: string }>(q, `
from(bucket: "${esc(env.emsInfluxBucket!)}")
  |> range(start: ${fluxTime(fromMs - leadInMs)}, stop: ${fluxTime(toMs)})
  |> filter(fn: (r) => r._measurement == "ems_power")
  |> filter(fn: (r) => r.data_type == "equipment")
  |> filter(fn: (r) => r._field == "value")
  |> filter(fn: (r) => ${names})
  |> keep(columns: ["name", "_value", "_time"])`);
    const out: Record<string, TagPoint[]> = Object.fromEntries(requested.map((d) => [d.key, []]));
    for (const o of rows) {
      const def = byName.get(o.name);
      if (def) out[def.key].push({ t: Date.parse(o._time), v: Number.isFinite(o._value) ? o._value : null });
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => a.t - b.t);
    return { connection: 'up', message: MSG.EMS_UP, series: out };
  } catch {
    return { connection: 'down', message: MSG.EMS_UNREACHABLE, series: empty };
  }
}

export interface EmsProbe {
  connection: 'up' | 'down';
  configured: boolean;
  message: string;
  latencyMs: number | null;
  /** Equipment names that published in the lookback — how HSM feeders get found. */
  equipment: string[];
  /** When any equipment row last wrote (within 30 days); null if none did. */
  lastReadingAt: number | null;
  /** Wrote within FRESH_MS. A reachable server whose meters stopped is not healthy. */
  fresh: boolean;
}

const EQUIPMENT = `r._measurement == "ems_power" and r.data_type == "equipment"`;

/**
 * Connection test + discovery: equipment names seen in the `lookbackDays` up to the LAST
 * reading (not up to now), and when equipment rows last wrote. Anchoring on the last
 * reading keeps a stalled feed listing its feeders however long it has been silent
 * (measured: equipment rows stopped 27 Sep 2026 while the server answered normally — a
 * window ending "now" found nothing a week later).
 */
export async function probeEms(env: Env, lookbackDays = 7, timeoutMs = 20_000, nowMs = Date.now()): Promise<EmsProbe> {
  const none = { equipment: [], lastReadingAt: null, fresh: false };
  if (!emsConfigured(env)) {
    return { connection: 'down', configured: false, message: MSG.EMS_NOT_CONFIGURED, latencyMs: null, ...none };
  }
  const t0 = Date.now();
  try {
    const q = queryApi(env.emsInfluxUrl!, env.emsInfluxToken!, env.emsInfluxOrg, timeoutMs);
    const lastReadingAt = await lastWrite(q, env.emsInfluxBucket!, EQUIPMENT, '30d');
    const end = lastReadingAt ?? nowMs;
    const rows = await collect<{ _value: string }>(q, `
import "influxdata/influxdb/schema"
schema.tagValues(bucket: "${esc(env.emsInfluxBucket!)}", tag: "name", predicate: (r) => ${EQUIPMENT},
  start: ${fluxTime(end - Math.round(lookbackDays) * 86_400_000)}, stop: ${fluxTime(end + 1)})`);
    const fresh = lastReadingAt !== null && nowMs - lastReadingAt <= FRESH_MS;
    return {
      connection: 'up', configured: true, message: fresh ? MSG.EMS_UP : MSG.EMS_STALE,
      latencyMs: Date.now() - t0, equipment: rows.map((r) => r._value).sort(), lastReadingAt, fresh,
    };
  } catch {
    return { connection: 'down', configured: true, message: MSG.EMS_UNREACHABLE, latencyMs: null, ...none };
  }
}
