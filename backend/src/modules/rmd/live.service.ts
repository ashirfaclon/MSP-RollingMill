/**
 * RMD mill flow, live from the plant historian: billets since the RMD day started (08:00 IST)
 * and the running status of every route / diverter and finishing point, with a trend of each
 * point's running share for the drill-down.
 *
 * A point is ON when its latest status is 1 and that reading is at most 15 minutes old; an
 * older reading is "no live data", never its last known state — a stalled feed must not read
 * as a mill that is running. A zone's state counts its points the same way as HSM's stand
 * groups (all on / x of y on / all off / no live data).
 */
import type { Env } from '../../config/env';
import type { RmdLive, RmdStationNow, RmdStationTrend, RmdZoneId, RmdZoneNow } from '../../contracts';
import { FRESH_MS, bucketSeconds, collect, esc, fluxTime, queryApi } from '../../integrations/influx';
import { historianConfigured } from '../../integrations/historian/client';
import { RMD_BILLET_COUNT, RMD_STATIONS, type RmdStationDef } from '../../integrations/historian/tags';
import { MSG } from '../../shared/messages';
import { istDate, readCounter, round2 } from '../hsm/production.service';
import { RMD_DAY_START_HOUR, rmdDayStart } from './billets.service';

const H_MS = 3_600_000;
const ZONE_LABEL: Record<RmdZoneId, string> = { route: 'Route / diverter', finishing: 'Finishing group' };

const q = (env: Env, timeout = 60_000) =>
  queryApi(env.influxUrl!, env.influxToken ?? `${env.influxUser}:${env.influxPassword ?? ''}`, env.influxOrg, timeout);

/** Flux predicate selecting the given points (each by Unit, Group and field). */
const pointFilter = (defs: RmdStationDef[]) =>
  defs.map((s) => `(r.Unit == "${esc(s.unitTag)}" and r.Group == "${esc(s.group)}" and r._field == "${esc(s.field)}")`).join(' or ');

export function zoneState(stations: RmdStationNow[], id: RmdZoneId): RmdZoneNow {
  const mine = stations.filter((s) => s.zone === id);
  const reporting = mine.filter((s) => s.fresh && s.on !== null);
  const on = reporting.filter((s) => s.on).length;
  const state: RmdZoneNow['state'] = reporting.length === 0 ? 'no-data'
    : on === mine.length ? 'all-on'
    : on === 0 && reporting.length === mine.length ? 'all-off'
    : 'partial';
  const stateLabel = state === 'no-data' ? 'No live data'
    : state === 'all-on' ? 'All on'
    : state === 'all-off' ? 'All off'
    : `${on} of ${mine.length} on`;
  return { id, label: ZONE_LABEL[id], total: mine.length, on, reporting: reporting.length, state, stateLabel };
}

export async function rmdLive(env: Env, nowMs = Date.now()): Promise<RmdLive> {
  const plantDay = istDate(nowMs - RMD_DAY_START_HOUR * H_MS);
  const dayStart = rmdDayStart(plantDay);
  const base = { now: new Date(nowMs).toISOString(), plantDay, plantDayStart: new Date(dayStart).toISOString() };
  const empty = (connection: 'up' | 'down', message: string): RmdLive => {
    const stations = RMD_STATIONS.map((s) => ({ id: s.id, zone: s.zone, line: s.line, label: s.label, on: null, at: null, fresh: false }));
    return {
      connection, message, ...base, billetsToday: null, lastReadingAt: null, fresh: false,
      stations, zones: [zoneState(stations, 'route'), zoneState(stations, 'finishing')],
    };
  };
  if (!historianConfigured(env)) return empty('down', MSG.HISTORIAN_NOT_CONFIGURED);

  try {
    const [rows, m1, m2] = await Promise.all([
      collect<{ Unit: string; Group: string; _field: string; _value: unknown; _time: string }>(q(env), `
from(bucket: "${esc(env.influxBucket!)}")
  |> range(start: -6h)
  |> filter(fn: (r) => r._measurement == "TMT-RMD")
  |> filter(fn: (r) => ${pointFilter(RMD_STATIONS)})
  |> last()
  |> keep(columns: ["Unit", "Group", "_field", "_value", "_time"])`),
      readCounter(env, RMD_BILLET_COUNT.M1, dayStart, nowMs),
      readCounter(env, RMD_BILLET_COUNT.M2, dayStart, nowMs),
    ]);
    const at = new Map(rows.map((r) => [`${r.Unit}|${r.Group}|${r._field}`, { v: Number(r._value), t: Date.parse(r._time) }]));
    let last: number | null = null;
    const stations: RmdStationNow[] = RMD_STATIONS.map((s) => {
      const p = at.get(`${s.unitTag}|${s.group}|${s.field}`);
      const t = p?.t ?? NaN;
      if (Number.isFinite(t)) last = Math.max(last ?? t, t);
      const fresh = Number.isFinite(t) && nowMs - t <= FRESH_MS;
      return {
        id: s.id, zone: s.zone, line: s.line, label: s.label,
        on: fresh && p && Number.isFinite(p.v) ? p.v >= 0.5 : null,
        at: Number.isFinite(t) ? new Date(t).toISOString() : null,
        fresh,
      };
    });
    // Billets today: both counters read since 08:00 — a counter with no reading today adds nothing.
    const counted = [m1, m2].filter((c) => c.connection === 'up' && c.lastReadingAt !== null && c.lastReadingAt >= dayStart);
    const lastMs = last as number | null;
    return {
      connection: 'up', message: MSG.HISTORIAN_UP, ...base,
      billetsToday: counted.length ? Math.round(counted.flatMap((c) => c.increments).reduce((a, p) => a + p.v, 0)) : null,
      lastReadingAt: lastMs === null ? null : new Date(lastMs).toISOString(),
      fresh: lastMs !== null && nowMs - lastMs <= FRESH_MS,
      stations,
      zones: [zoneState(stations, 'route'), zoneState(stations, 'finishing')],
    };
  } catch {
    return empty('down', MSG.HISTORIAN_UNREACHABLE);
  }
}

/** Each point's running share (% of every interval with status 1) over the last `hours`. */
export async function rmdStationTrend(env: Env, zone: RmdZoneId, hours: number, nowMs = Date.now()): Promise<RmdStationTrend> {
  const fromMs = nowMs - hours * H_MS;
  const every = bucketSeconds(fromMs, nowMs);
  const defs = RMD_STATIONS.filter((s) => s.zone === zone);
  const base = { zone, from: new Date(fromMs).toISOString(), to: new Date(nowMs).toISOString(), bucketSeconds: every };
  const none = defs.map((s) => ({ id: s.id, line: s.line, label: s.label, points: [] as [number, number | null][] }));
  if (!historianConfigured(env)) return { connection: 'down', message: MSG.HISTORIAN_NOT_CONFIGURED, ...base, series: none };
  try {
    // Stamp each window with its START, so a point sits over the minutes it averages.
    const rows = await collect<{ Unit: string; Group: string; _field: string; _value: number | null; _time: string }>(q(env, 120_000), `
from(bucket: "${esc(env.influxBucket!)}")
  |> range(start: ${fluxTime(fromMs)}, stop: ${fluxTime(nowMs)})
  |> filter(fn: (r) => r._measurement == "TMT-RMD")
  |> filter(fn: (r) => ${pointFilter(defs)})
  |> toFloat()
  |> aggregateWindow(every: ${every}s, fn: mean, createEmpty: true, timeSrc: "_start")
  |> keep(columns: ["Unit", "Group", "_field", "_value", "_time"])`);
    return {
      connection: 'up', message: MSG.HISTORIAN_UP, ...base,
      series: defs.map((s) => ({
        id: s.id, line: s.line, label: s.label,
        points: rows
          .filter((r) => r.Unit === s.unitTag && r.Group === s.group && r._field === s.field)
          .map((r): [number, number | null] => [Date.parse(r._time), r._value === null || !Number.isFinite(Number(r._value)) ? null : round2(Number(r._value) * 100)]),
      })),
    };
  } catch {
    return { connection: 'down', message: MSG.HISTORIAN_UNREACHABLE, ...base, series: none };
  }
}
