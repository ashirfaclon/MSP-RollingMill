/**
 * Production per shift: Day 08:00–20:00, Night 20:00–08:00 IST, within each plant day.
 *
 * A counter run can cross 20:00, so the split is made from the counter's individual ticks
 * (each coil), noise-filtered by the same billet rule as the Production card. Each plant
 * day's split is then scaled to that day's Production-card figure, so Day + Night always
 * equals the card exactly; ticks only decide the shares.
 */
import type { Env } from '../../config/env';
import { HSM_DISCHARGED_BILLET, HSM_TOTAL_PRODUCTION } from '../../integrations/historian/tags';
import { NOISE_WINDOW_MS, denoise } from './counter-events';
import { DAY_MS, PLANT_DAY_START_HOUR, istDate, plantDayStart, readCounter, round2, type Increment } from './production.service';

export const SHIFTS = ['Day', 'Night'] as const;
export type ShiftName = (typeof SHIFTS)[number];
const H_MS = 3_600_000;
const IST_MS = 330 * 60_000;

/** Day 08:00–20:00 IST, else Night. */
export const shiftOf = (t: number): ShiftName => {
  const h = new Date(t + IST_MS).getUTCHours();
  return h >= PLANT_DAY_START_HOUR && h < PLANT_DAY_START_HOUR + 12 ? 'Day' : 'Night';
};

/** Per plant day: each shift's share of `dayMt`, from where the ticks fell. Pure. */
export function splitByShift(ticks: Increment[], dayMt: Map<string, number | null>): Map<string, Record<ShiftName, number> | null> {
  const raw = new Map<string, Record<ShiftName, number>>();
  for (const k of ticks) {
    const d = istDate(k.t - PLANT_DAY_START_HOUR * H_MS);
    const r = raw.get(d) ?? { Day: 0, Night: 0 };
    r[shiftOf(k.t)] += k.v;
    raw.set(d, r);
  }
  const out = new Map<string, Record<ShiftName, number> | null>();
  for (const [date, mt] of dayMt) {
    if (mt === null) { out.set(date, null); continue; }
    const r = raw.get(date) ?? { Day: 0, Night: 0 };
    const sum = r.Day + r.Night;
    // No ticks but a figure (should not happen): put it on neither shift rather than guess.
    out.set(date, sum > 0 ? { Day: round2((mt * r.Day) / sum), Night: round2(mt - round2((mt * r.Day) / sum)) } : { Day: 0, Night: 0 });
  }
  return out;
}

/** Read the noise-filtered production ticks for plant dates `from`..`to`. */
export async function productionTicks(env: Env, from: string, to: string, nowMs = Date.now()): Promise<Increment[] | null> {
  const fromMs = plantDayStart(from);
  const toMs = Math.min(plantDayStart(to) + DAY_MS, nowMs);
  const [ticks, billets] = await Promise.all([
    readCounter(env, HSM_TOTAL_PRODUCTION, fromMs, toMs),
    readCounter(env, HSM_DISCHARGED_BILLET, fromMs - NOISE_WINDOW_MS, toMs),
  ]);
  if (ticks.connection !== 'up') return null;
  return billets.connection === 'up' ? denoise(ticks.increments, billets.increments).kept : ticks.increments;
}
