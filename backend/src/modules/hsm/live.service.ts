/**
 * HSM live state from the plant historian: billets discharged in the current plant day,
 * each stand's latest drive readings, and stand trends for the drill-down.
 *
 * Freshness is part of the answer: a stand whose last reading is older than FRESH_MS is
 * "no live data", never its last known state — a stalled feed must not read as a mill
 * that is running.
 */
import type { Env } from '../../config/env';
import { MSG } from '../../shared/messages';
import { FRESH_MS, bucketSeconds, collect, esc, fluxTime, queryApi } from '../../integrations/influx';
import { historianConfigured } from '../../integrations/historian/client';
import { HSM_DISCHARGED_BILLET, HSM_MILL_SPEED, HSM_STANDS, type StandDef } from '../../integrations/historian/tags';
import { PLANT_DAY_START_HOUR, istDate, plantDayStart, readCounter, round2 } from './production.service';
import type { StandNow, GroupNow, HsmLive, StandMetric, StandTrend } from '../../contracts';
export type { StandNow, GroupNow, HsmLive, StandMetric, StandTrend };

const H_MS = 3_600_000;

const q = (env: Env, timeout = 60_000) =>
  queryApi(env.influxUrl!, env.influxToken ?? `${env.influxUser}:${env.influxPassword ?? ''}`, env.influxOrg, timeout);

const asNum = (v: unknown) => {
  const n = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);
  return Number.isFinite(n) ? n : null;
};

const GROUP_LABEL: Record<StandDef['group'], string> = { roughing: 'Roughing group', finishing: 'Finishing group' };

export function groupState(stands: StandNow[], id: StandDef['group']): GroupNow {
  const mine = stands.filter((s) => s.group === id);
  const reporting = mine.filter((s) => s.fresh && s.on !== null);
  const on = reporting.filter((s) => s.on).length;
  const state: GroupNow['state'] = reporting.length === 0 ? 'no-data'
    : on === mine.length ? 'all-on'
    : on === 0 && reporting.length === mine.length ? 'all-off'
    : 'partial';
  const stateLabel = state === 'no-data' ? 'No live data'
    : state === 'all-on' ? 'All stands on'
    : state === 'all-off' ? 'All stands off'
    : `${on} of ${mine.length} on`;
  return { id, label: GROUP_LABEL[id], total: mine.length, on, reporting: reporting.length, state, stateLabel };
}

export async function hsmLive(env: Env, nowMs = Date.now()): Promise<HsmLive> {
  const plantDay = istDate(nowMs - PLANT_DAY_START_HOUR * H_MS);
  const dayStart = plantDayStart(plantDay);
  const base = {
    now: new Date(nowMs).toISOString(), plantDay, plantDayStart: new Date(dayStart).toISOString(),
  };
  const empty = (connection: 'up' | 'down', message: string): HsmLive => {
    const stands = HSM_STANDS.map((s) => ({ id: s.id, group: s.group, on: null, currentA: null, rpm: null, forceT: null, at: null, fresh: false }));
    return {
      connection, message, ...base, billetsToday: null, millSpeed: null, lastReadingAt: null, fresh: false,
      stands, groups: [groupState(stands, 'roughing'), groupState(stands, 'finishing')],
    };
  };
  if (!historianConfigured(env)) return empty('down', MSG.HISTORIAN_NOT_CONFIGURED);

  const fields = new Set(HSM_STANDS.flatMap((s) => Object.values(s.fields)));
  try {
    const [rows, speed, billets] = await Promise.all([
      collect<{ Unit: string; Group: string; _field: string; _value: unknown; _time: string }>(q(env), `
from(bucket: "${esc(env.influxBucket!)}")
  |> range(start: -6h)
  |> filter(fn: (r) => r._measurement == "HSM" and (r.Unit == "Roughing Mill" or r.Unit == "Finishing Mill") and r.Group =~ /^(RM|FM)_0[0-9]$/)
  |> filter(fn: (r) => ${[...fields].map((f) => `r._field == "${esc(f)}"`).join(' or ')})
  |> last()
  |> keep(columns: ["Unit", "Group", "_field", "_value", "_time"])`),
      collect<{ _value: unknown; _time: string }>(q(env), `
from(bucket: "${esc(env.influxBucket!)}")
  |> range(start: -6h)
  |> filter(fn: (r) => r._measurement == "${esc(HSM_MILL_SPEED.measurement)}" and r.Unit == "${esc(HSM_MILL_SPEED.unitTag)}" and r.Group == "${esc(HSM_MILL_SPEED.group!)}" and r._field == "${esc(HSM_MILL_SPEED.field)}")
  |> last()
  |> keep(columns: ["_value", "_time"])`),
      readCounter(env, HSM_DISCHARGED_BILLET, dayStart, nowMs),
    ]);

    const at = new Map<string, { v: number | null; t: number }>();
    for (const r of rows) at.set(`${r.Unit}|${r.Group}|${r._field}`, { v: asNum(r._value), t: Date.parse(r._time) });
    let last: number | null = null;
    const stands: StandNow[] = HSM_STANDS.map((s) => {
      const get = (f: string) => at.get(`${s.unitTag}|${s.id}|${f}`);
      const onOff = get(s.fields.onOff);
      const t = Math.max(...Object.values(s.fields).map((f) => get(f)?.t ?? -Infinity));
      if (Number.isFinite(t)) last = Math.max(last ?? t, t);
      const fresh = Number.isFinite(t) && nowMs - t <= FRESH_MS;
      const val = (f: string) => { const v = get(f)?.v; return v === null || v === undefined ? null : round2(v); };
      return {
        id: s.id, group: s.group,
        on: fresh && onOff?.v !== null && onOff?.v !== undefined ? onOff.v >= 0.5 : null,
        currentA: val(s.fields.current), rpm: val(s.fields.rpm), forceT: val(s.fields.force),
        at: Number.isFinite(t) ? new Date(t).toISOString() : null,
        fresh,
      };
    });
    const lastMs = last as number | null;
    const spd = speed[0] ? asNum(speed[0]._value) : null;
    return {
      connection: 'up', message: MSG.HISTORIAN_UP, ...base,
      billetsToday: billets.connection === 'up' && billets.lastReadingAt !== null && billets.lastReadingAt >= dayStart
        ? Math.round(billets.increments.reduce((a, p) => a + p.v, 0))
        : null,
      millSpeed: spd === null ? null : round2(spd),
      lastReadingAt: lastMs === null ? null : new Date(lastMs).toISOString(),
      fresh: lastMs !== null && nowMs - lastMs <= FRESH_MS,
      stands,
      groups: [groupState(stands, 'roughing'), groupState(stands, 'finishing')],
    };
  } catch {
    return empty('down', MSG.HISTORIAN_UNREACHABLE);
  }
}

/* --------------------------------- trend --------------------------------- */

export const STAND_METRICS: Record<StandMetric, { label: string; unit: string }> = {
  current: { label: 'Motor current', unit: 'A' },
  rpm: { label: 'Motor speed', unit: 'rpm' },
  force: { label: 'Roll force', unit: 't' },
  onOff: { label: 'Drive on (share of interval)', unit: '%' },
};

export async function standTrend(env: Env, group: StandDef['group'], metric: StandMetric, hours: number, nowMs = Date.now()): Promise<StandTrend> {
  const fromMs = nowMs - hours * H_MS;
  const every = bucketSeconds(fromMs, nowMs);
  const stands = HSM_STANDS.filter((s) => s.group === group);
  const fieldOf = (s: StandDef) => (metric === 'onOff' ? s.fields.onOff : s.fields[metric]);
  const base = {
    group, metric, unit: STAND_METRICS[metric].unit,
    from: new Date(fromMs).toISOString(), to: new Date(nowMs).toISOString(), bucketSeconds: every,
  };
  const none = { series: stands.map((s) => ({ id: s.id, field: fieldOf(s), points: [] })), speed: [] };
  if (!historianConfigured(env)) return { connection: 'down', message: MSG.HISTORIAN_NOT_CONFIGURED, ...base, ...none };

  const range = `range(start: ${fluxTime(fromMs)}, stop: ${fluxTime(nowMs)})`;
  // Stamp each window with its START, so a point sits over the minutes it averages.
  const agg = `aggregateWindow(every: ${every}s, fn: mean, createEmpty: true, timeSrc: "_start")`;
  try {
    const [rows, speed] = await Promise.all([
      collect<{ Group: string; _field: string; _value: number | null; _time: string }>(q(env, 120_000), `
from(bucket: "${esc(env.influxBucket!)}")
  |> ${range}
  |> filter(fn: (r) => r._measurement == "HSM" and r.Unit == "${esc(stands[0].unitTag)}")
  |> filter(fn: (r) => ${stands.map((s) => `(r.Group == "${esc(s.id)}" and r._field == "${esc(fieldOf(s))}")`).join(' or ')})
  |> toFloat()
  |> ${agg}
  |> keep(columns: ["Group", "_field", "_value", "_time"])`),
      collect<{ _value: number | null; _time: string }>(q(env, 120_000), `
from(bucket: "${esc(env.influxBucket!)}")
  |> ${range}
  |> filter(fn: (r) => r._measurement == "${esc(HSM_MILL_SPEED.measurement)}" and r.Unit == "${esc(HSM_MILL_SPEED.unitTag)}" and r.Group == "${esc(HSM_MILL_SPEED.group!)}" and r._field == "${esc(HSM_MILL_SPEED.field)}")
  |> toFloat()
  |> ${agg}
  |> keep(columns: ["_value", "_time"])`),
    ]);
    const scale = metric === 'onOff' ? 100 : 1;
    const pt = (t: string, v: number | null): [number, number | null] =>
      [Date.parse(t), v === null || v === undefined || !Number.isFinite(Number(v)) ? null : round2(Number(v) * scale)];
    return {
      connection: 'up', message: MSG.HISTORIAN_UP, ...base,
      series: stands.map((s) => ({
        id: s.id, field: fieldOf(s),
        points: rows.filter((r) => r.Group === s.id).map((r) => pt(r._time, r._value)),
      })),
      speed: speed.map((r) => pt(r._time, r._value)),
    };
  } catch {
    return { connection: 'down', message: MSG.HISTORIAN_UNREACHABLE, ...base, ...none };
  }
}
