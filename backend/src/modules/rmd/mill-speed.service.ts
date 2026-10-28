/**
 * RMD Mill MPS, as the plant gave it: CR Mill1/2 · General · MILL1_MPS (mill 1) and MILL2_MPS
 * (mill 2), the mill speed in m/s, read every 10 s. Over a period of RMD days (09:00 → 09:00 IST):
 *   latest  each mill's last reading of the period — now, for a period that includes today;
 *   trend   each mill's mean reading per bucket (about 150 buckets over the period).
 */
import type { Env } from '../../config/env';
import type { RmdMillSpeedPoint, RmdMillSpeedReport } from '../../contracts';
import { collect, esc, fluxTime, queryApi } from '../../integrations/influx';
import { historianConfigured } from '../../integrations/historian/client';
import { MSG } from '../../shared/messages';
import { round2 } from '../hsm/production.service';
import { rmdDayStart } from './billets.service';

const H_MS = 3_600_000;
const FIELDS = { mill1: 'MILL1_MPS', mill2: 'MILL2_MPS' } as const;
const q = (env: Env) => queryApi(env.influxUrl!, env.influxToken ?? `${env.influxUser}:${env.influxPassword ?? ''}`, env.influxOrg, 120_000);

/** Trend bucket: about 150 over the span, in whole 5-minute steps (1 day → 10 min, 7 days → 70 min). */
export function bucketMinutesOf(fromMs: number, toMs: number): number {
  return Math.max(5, Math.ceil((toMs - fromMs) / 60_000 / 150 / 5) * 5);
}

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? round2(Number(v)) : null);

export async function rmdMillSpeed(env: Env, from: string, to: string, nowMs = Date.now()): Promise<RmdMillSpeedReport> {
  const fromMs = rmdDayStart(from);
  const toMs = Math.min(rmdDayStart(to) + 24 * H_MS, nowMs);
  const bucketMinutes = bucketMinutesOf(fromMs, toMs);
  const base = { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), bucketMinutes };
  const empty = { latest: { mill1: null, mill2: null, at: null }, trend: [] as RmdMillSpeedPoint[] };
  if (!historianConfigured(env)) return { ...base, ...empty, historian: { connection: 'down', message: MSG.HISTORIAN_NOT_CONFIGURED } };
  if (toMs <= fromMs) return { ...base, ...empty, historian: { connection: 'up', message: MSG.HISTORIAN_UP } };

  const src = `from(bucket: "${esc(env.influxBucket!)}")
  |> range(start: ${fluxTime(fromMs)}, stop: ${fluxTime(toMs)})
  |> filter(fn: (r) => r._measurement == "TMT-RMD" and r.Unit == "CR Mill1/2" and r.Group == "General"
      and (r._field == "${FIELDS.mill1}" or r._field == "${FIELDS.mill2}"))
  |> map(fn: (r) => ({ r with _value: float(v: r._value) }))`;
  try {
    const [last, trend] = await Promise.all([
      collect<{ _field: string; _value: number; _time: string }>(q(env), `${src}
  |> last()
  |> keep(columns: ["_field", "_value", "_time"])`),
      collect<{ _time: string } & Record<string, unknown>>(q(env), `${src}
  |> aggregateWindow(every: ${bucketMinutes}m, fn: mean, createEmpty: false, timeSrc: "_start")
  |> keep(columns: ["_field", "_value", "_time"])
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"])`),
    ]);
    const at = (f: string) => last.find((r) => r._field === f);
    const times = last.map((r) => Date.parse(r._time)).filter(Number.isFinite);
    return {
      ...base,
      historian: { connection: 'up', message: MSG.HISTORIAN_UP },
      latest: {
        mill1: num(at(FIELDS.mill1)?._value),
        mill2: num(at(FIELDS.mill2)?._value),
        at: times.length ? new Date(Math.max(...times)).toISOString() : null,
      },
      trend: trend.map((r) => ({ t: new Date(r._time).toISOString(), mill1: num(r[FIELDS.mill1]), mill2: num(r[FIELDS.mill2]) })),
    };
  } catch {
    return { ...base, ...empty, historian: { connection: 'down', message: MSG.HISTORIAN_UNREACHABLE } };
  }
}
