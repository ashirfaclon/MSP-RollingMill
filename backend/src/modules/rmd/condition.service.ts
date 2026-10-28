/**
 * RMD Condition Analytics · grouped condition mimic (RMD FACLON Persona - 2, KPI-3 … KPI-7): each
 * drive's mean current (A) and speed (RPM) while it runs, over a period of RMD days (09:00 → 09:00
 * IST), from the plant historian:
 *   stands     CR Mill1/2 · M1 S1–S8 (line 1), M2 S1–S6 (line 2) — CURRENT_FB_Sn, SPEED_FB_Sn;
 *   finishing  Line-1 · M1 CUR_FB / SPD_FB (FS, PR1, PR2, TB1, TB2) and Line-2 · General
 *              *_Current / *_RPM (CS, pinch rolls, tail breakers).
 * "While it runs": status, current and speed are averaged per minute in the historian (fast — the
 * storage does it), and a minute counts when the drive ran all of it (status mean 1); a drive that
 * never ran has no mean. (As the Asset Health motor current drill-down.)
 */
import type { Env } from '../../config/env';
import type { RmdConditionDrive, RmdConditionGroup, RmdConditionReport } from '../../contracts';
import { collect, esc, fluxTime, queryApi } from '../../integrations/influx';
import { historianConfigured } from '../../integrations/historian/client';
import { RMD_STATIONS, type RmdStationDef } from '../../integrations/historian/tags';
import { MSG } from '../../shared/messages';
import { round2 } from '../hsm/production.service';
import { rmdDayStart } from './billets.service';

const H_MS = 3_600_000;
const q = (env: Env) => queryApi(env.influxUrl!, env.influxToken ?? `${env.influxUser}:${env.influxPassword ?? ''}`, env.influxOrg, 180_000);

/** Group mean of the drives that ran: each drive weighs the same. */
export function groupOf(drives: RmdConditionDrive[]): RmdConditionGroup {
  const ran = drives.filter((d) => d.meanA !== null);
  const mean = (xs: number[]) => (xs.length ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return {
    drives,
    ran: ran.length,
    meanA: mean(ran.map((d) => d.meanA!)),
    // Speed is compared per line: the two lines' drives read on different scales.
    meanRpmByLine: Object.fromEntries(([1, 2] as const).map((l) => [l, mean(ran.filter((d) => d.line === l && d.meanRpm !== null).map((d) => d.meanRpm!))])),
  };
}

async function readDrives(env: Env, defs: RmdStationDef[], fromMs: number, toMs: number): Promise<RmdConditionDrive[]> {
  const streams = defs.map((s, i) => `d${i} = from(bucket: "${esc(env.influxBucket!)}")
  |> range(start: ${fluxTime(fromMs)}, stop: ${fluxTime(toMs)})
  |> filter(fn: (r) => r._measurement == "TMT-RMD" and r.Unit == "${esc(s.unitTag)}" and r.Group == "${esc(s.group)}"
      and (r._field == "${esc(s.field)}" or r._field == "${esc(s.currentField)}" or r._field == "${esc(s.speedField)}"))
  |> aggregateWindow(every: 1m, fn: mean, createEmpty: false, timeSrc: "_start")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> filter(fn: (r) => exists r["${esc(s.field)}"] and exists r["${esc(s.currentField)}"] and exists r["${esc(s.speedField)}"]
      and float(v: r["${esc(s.field)}"]) >= 0.999)
  |> map(fn: (r) => ({ _start: r._start, _stop: r._stop, drive: "${esc(s.id)}", a: float(v: r["${esc(s.currentField)}"]), rpm: float(v: r["${esc(s.speedField)}"]) }))
  |> group(columns: ["drive"])
  |> reduce(fn: (r, accumulator) => ({ n: accumulator.n + 1.0, a: accumulator.a + r.a, rpm: accumulator.rpm + r.rpm }), identity: { n: 0.0, a: 0.0, rpm: 0.0 })`).join('\n');
  const rows = await collect<{ drive: string; n: number; a: number; rpm: number }>(q(env), `${streams}
union(tables: [${defs.map((_, i) => `d${i}`).join(', ')}])
  |> keep(columns: ["drive", "n", "a", "rpm"])`);
  return defs.map((s) => {
    const r = rows.find((x) => x.drive === s.id);
    const n = r ? Number(r.n) : 0;
    return {
      id: s.id, line: s.line, label: s.label,
      meanA: n ? round2(Number(r!.a) / n) : null,
      meanRpm: n ? round2(Number(r!.rpm) / n) : null,
    };
  });
}

export async function rmdCondition(env: Env, from: string, to: string, nowMs = Date.now()): Promise<RmdConditionReport> {
  const fromMs = rmdDayStart(from);
  const toMs = Math.min(rmdDayStart(to) + 24 * H_MS, nowMs);
  const route = RMD_STATIONS.filter((s) => s.zone === 'route');
  const finishing = RMD_STATIONS.filter((s) => s.zone === 'finishing');
  const none = (defs: RmdStationDef[]) => groupOf(defs.map((s) => ({ id: s.id, line: s.line, label: s.label, meanA: null, meanRpm: null })));
  const base = { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() };
  if (!historianConfigured(env)) {
    return { ...base, historian: { connection: 'down', message: MSG.HISTORIAN_NOT_CONFIGURED }, stands: none(route), finishing: none(finishing) };
  }
  if (toMs <= fromMs) return { ...base, historian: { connection: 'up', message: MSG.HISTORIAN_UP }, stands: none(route), finishing: none(finishing) };
  try {
    const [stands, fin] = await Promise.all([readDrives(env, route, fromMs, toMs), readDrives(env, finishing, fromMs, toMs)]);
    return { ...base, historian: { connection: 'up', message: MSG.HISTORIAN_UP }, stands: groupOf(stands), finishing: groupOf(fin) };
  } catch {
    return { ...base, historian: { connection: 'down', message: MSG.HISTORIAN_UNREACHABLE }, stands: none(route), finishing: none(finishing) };
  }
}
