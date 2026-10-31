/**
 * Equipment settings (the user, 31 Oct 2026): the HSM stand motors' rated current, the RMD gearbox
 * oil tanks' inside dimensions and the RMD temperature limits. The defaults are in config/equipment.ts;
 * an edit made on the dashboard (the Motor current / Gearbox oil / Bearing temp drill-downs) is saved
 * to the logbook "Equipment settings" forms — one entry per motor, tank or limit, the latest wins —
 * and from then on is the value in use. The logbook
 * entry records who changed it and when; the code is never rewritten at run time.
 */
import type { Env } from '../../config/env';
import { EQUIPMENT_LIMITS, HSM_MOTOR_DEFAULTS, RMD_OIL_TANK_DEFAULTS, RMD_TEMP_LIMIT_DEFAULTS, type RmdTempLimitId } from '../../config/equipment';
import type { HsmMotorRatings, HsmMotorRatingsBody, RmdOilTanks, RmdOilTanksBody, RmdTempLimits, RmdTempLimitsBody } from '../../contracts';
import { fetchFormEntries, num, saveFormEntries, type FormWrite, type InsightEntry } from '../../integrations/logbook/client';
import { HttpError } from '../../shared/http-error';
import { MSG } from '../../shared/messages';
import { HSM_MOTOR_FORM, MOTOR_KEYS, RMD_TANK_FORM, RMD_TEMP_LIMIT_FORM, TANK_KEYS, TEMP_LIMIT_KEYS, tagOf } from './forms';

/** Settings are saved rarely: read every entry ever made (ten years). */
const LOOK_BACK_MS = 3650 * 86_400_000;
const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;

/** The latest entry of each key, with who saved it and when. */
async function latestByKey(env: Env, form: string, key: string) {
  const read = await fetchFormEntries(tagOf(form), Date.now() - LOOK_BACK_MS, env);
  const out = new Map<string, { v: Record<string, unknown>; at: string; by: string | null }>();
  if (!read.ok) return { read, out };
  const at = (r: InsightEntry) => String((r.metadata as { editedAt?: string } | undefined)?.editedAt ?? r.createdAt ?? r.invocationTime ?? '');
  for (const r of [...read.rows].sort((a, b) => at(a).localeCompare(at(b)))) {
    const k = String(r.result?.[key] ?? '').trim();
    if (!k) continue;
    const m = (r.metadata ?? {}) as { editedBy?: string; filledBy?: string };
    out.set(k, { v: r.result ?? {}, at: at(r), by: m.editedBy ?? m.filledBy ?? null });
  }
  return { read, out };
}
const logbookOf = (read: { ok: boolean; message?: string }) =>
  ({ connection: read.ok ? 'up' as const : 'down' as const, message: read.ok ? MSG.LOGBOOK_UP : read.message ?? '' });

// ---------------------------------- HSM motors ----------------------------------

export async function hsmMotorRatings(env: Env): Promise<HsmMotorRatings> {
  const { read, out } = await latestByKey(env, HSM_MOTOR_FORM, MOTOR_KEYS.stand);
  return {
    logbook: logbookOf(read),
    rows: HSM_MOTOR_DEFAULTS.map((d) => {
      const s = out.get(d.stand);
      const a = s ? num(s.v[MOTOR_KEYS.ratedCurrentA]) : null;
      return { stand: d.stand, ratedCurrentA: a ?? d.ratedCurrentA, defaultA: d.ratedCurrentA, edited: a !== null, editedAt: a !== null ? s!.at : null, editedBy: a !== null ? s!.by : null };
    }),
  };
}

export async function saveHsmMotorRatings(env: Env, body: HsmMotorRatingsBody, filledBy: string): Promise<FormWrite> {
  const known = new Set(HSM_MOTOR_DEFAULTS.map((d) => d.stand));
  const [lo, hi] = EQUIPMENT_LIMITS.ratedCurrentA;
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (!rows.length) throw new HttpError(400, 'bad_rows', 'rows must list the motors to save');
  const current = new Map((await hsmMotorRatings(env)).rows.map((r) => [r.stand, r.ratedCurrentA]));
  const entries = rows.map((r) => {
    if (!known.has(r?.stand)) throw new HttpError(400, 'bad_stand', `unknown stand: ${String(r?.stand)}`);
    const a = Number(r.ratedCurrentA);
    if (!Number.isFinite(a) || a < lo || a > hi) throw new HttpError(400, 'bad_value', `${r.stand}: rated current must be ${lo}–${hi} A`);
    return { [MOTOR_KEYS.stand]: r.stand, [MOTOR_KEYS.ratedCurrentA]: round(a, 1) };
  }).filter((e) => current.get(String(e[MOTOR_KEYS.stand])) !== e[MOTOR_KEYS.ratedCurrentA]);   // only what changed
  if (!entries.length) return { ok: true, saved: 0, added: 0, updated: 0, removed: 0 };
  return saveFormEntries(HSM_MOTOR_FORM, entries, (x) => String(x[MOTOR_KEYS.stand] ?? ''), filledBy, env);
}

/** stand → rated current in use (A). */
export async function hsmRatedCurrents(env: Env): Promise<Map<string, number>> {
  return new Map((await hsmMotorRatings(env)).rows.map((r) => [r.stand, r.ratedCurrentA]));
}

// ---------------------------------- RMD oil tanks ----------------------------------

export type TankSize = { lengthM: number; widthM: number; depthM: number };
export const capacityL = (s: TankSize) => Math.round(s.lengthM * s.widthM * s.depthM * 1000);

export async function rmdOilTanks(env: Env): Promise<RmdOilTanks> {
  const { read, out } = await latestByKey(env, RMD_TANK_FORM, TANK_KEYS.tank);
  return {
    logbook: logbookOf(read),
    rows: RMD_OIL_TANK_DEFAULTS.map((d) => {
      const s = out.get(d.tank);
      const l = s ? num(s.v[TANK_KEYS.lengthM]) : null;
      const w = s ? num(s.v[TANK_KEYS.widthM]) : null;
      const h = s ? num(s.v[TANK_KEYS.depthM]) : null;
      const edited = l !== null && w !== null && h !== null;
      const size = edited ? { lengthM: l!, widthM: w!, depthM: h! } : { lengthM: d.lengthM, widthM: d.widthM, depthM: d.depthM };
      return {
        tank: d.tank, label: d.label, group: d.group, ...size, capacityL: capacityL(size),
        defaults: { lengthM: d.lengthM, widthM: d.widthM, depthM: d.depthM },
        edited, editedAt: edited ? s!.at : null, editedBy: edited ? s!.by : null,
      };
    }),
  };
}

export async function saveRmdOilTanks(env: Env, body: RmdOilTanksBody, filledBy: string): Promise<FormWrite> {
  const byTank = new Map(RMD_OIL_TANK_DEFAULTS.map((d) => [d.tank, d]));
  const [lo, hi] = EQUIPMENT_LIMITS.tankM;
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (!rows.length) throw new HttpError(400, 'bad_rows', 'rows must list the tanks to save');
  const current = new Map((await rmdOilTanks(env)).rows.map((r) => [r.tank, r]));
  const entries = rows.map((r) => {
    const d = byTank.get(r?.tank);
    if (!d) throw new HttpError(400, 'bad_tank', `unknown tank: ${String(r?.tank)}`);
    const size = { lengthM: Number(r.lengthM), widthM: Number(r.widthM), depthM: Number(r.depthM) };
    for (const [k, v] of Object.entries(size)) {
      if (!Number.isFinite(v) || v < lo || v > hi) throw new HttpError(400, 'bad_value', `${d.label}: ${k} must be ${lo}–${hi} m`);
    }
    const s = { lengthM: round(size.lengthM, 3), widthM: round(size.widthM, 3), depthM: round(size.depthM, 3) };
    return {
      [TANK_KEYS.tank]: d.tank, [TANK_KEYS.name]: d.label,
      [TANK_KEYS.lengthM]: s.lengthM, [TANK_KEYS.widthM]: s.widthM, [TANK_KEYS.depthM]: s.depthM, [TANK_KEYS.capacityL]: capacityL(s),
    };
  }).filter((e) => {
    const c = current.get(String(e[TANK_KEYS.tank]));
    return !c || c.lengthM !== e[TANK_KEYS.lengthM] || c.widthM !== e[TANK_KEYS.widthM] || c.depthM !== e[TANK_KEYS.depthM];
  });
  if (!entries.length) return { ok: true, saved: 0, added: 0, updated: 0, removed: 0 };
  return saveFormEntries(RMD_TANK_FORM, entries, (x) => String(x[TANK_KEYS.tank] ?? ''), filledBy, env);
}

/** tank → its inside size in use (m). */
export async function rmdTankSizes(env: Env): Promise<Map<string, TankSize>> {
  return new Map((await rmdOilTanks(env)).rows.map((r) => [r.tank, { lengthM: r.lengthM, widthM: r.widthM, depthM: r.depthM }]));
}

// ---------------------------------- RMD temperature limits ----------------------------------

export async function rmdTempLimits(env: Env): Promise<RmdTempLimits> {
  const { read, out } = await latestByKey(env, RMD_TEMP_LIMIT_FORM, TEMP_LIMIT_KEYS.limit);
  return {
    logbook: logbookOf(read),
    rows: RMD_TEMP_LIMIT_DEFAULTS.map((d) => {
      const s = out.get(d.limit);
      const lo = s ? num(s.v[TEMP_LIMIT_KEYS.minC]) : null;
      const hi = s ? num(s.v[TEMP_LIMIT_KEYS.maxC]) : null;
      const edited = lo !== null && hi !== null;
      return {
        limit: d.limit, label: d.label, minC: edited ? lo! : d.minC, maxC: edited ? hi! : d.maxC,
        defaults: { minC: d.minC, maxC: d.maxC },
        edited, editedAt: edited ? s!.at : null, editedBy: edited ? s!.by : null,
      };
    }),
  };
}

export async function saveRmdTempLimits(env: Env, body: RmdTempLimitsBody, filledBy: string): Promise<FormWrite> {
  const byId = new Map(RMD_TEMP_LIMIT_DEFAULTS.map((d) => [d.limit as string, d]));
  const [lo, hi] = EQUIPMENT_LIMITS.tempC;
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (!rows.length) throw new HttpError(400, 'bad_rows', 'rows must list the limits to save');
  const current = new Map((await rmdTempLimits(env)).rows.map((r) => [r.limit as string, r]));
  const entries = rows.map((r) => {
    const d = byId.get(r?.limit);
    if (!d) throw new HttpError(400, 'bad_limit', `unknown limit: ${String(r?.limit)}`);
    const minC = Number(r.minC); const maxC = Number(r.maxC);
    for (const v of [minC, maxC]) {
      if (!Number.isFinite(v) || v < lo || v > hi) throw new HttpError(400, 'bad_value', `${d.label}: limits must be ${lo}–${hi} °C`);
    }
    if (minC >= maxC) throw new HttpError(400, 'bad_value', `${d.label}: min must be below max`);
    return { [TEMP_LIMIT_KEYS.limit]: d.limit, [TEMP_LIMIT_KEYS.name]: d.label, [TEMP_LIMIT_KEYS.minC]: round(minC, 1), [TEMP_LIMIT_KEYS.maxC]: round(maxC, 1) };
  }).filter((e) => {
    const c = current.get(String(e[TEMP_LIMIT_KEYS.limit]));
    return !c || c.minC !== e[TEMP_LIMIT_KEYS.minC] || c.maxC !== e[TEMP_LIMIT_KEYS.maxC];
  });
  if (!entries.length) return { ok: true, saved: 0, added: 0, updated: 0, removed: 0 };
  return saveFormEntries(RMD_TEMP_LIMIT_FORM, entries, (x) => String(x[TEMP_LIMIT_KEYS.limit] ?? ''), filledBy, env);
}

export type TempLimits = Record<RmdTempLimitId, readonly [number, number]>;
/** limit → [min, max] °C in use. */
export async function rmdTempLimitsInUse(env: Env): Promise<TempLimits> {
  return Object.fromEntries((await rmdTempLimits(env)).rows.map((r) => [r.limit, [r.minC, r.maxC] as const])) as TempLimits;
}
