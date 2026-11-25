/**
 * Every reading a mill's limits judge, read from the same forms and worked out the same way as its
 * Asset Health screen (the services below are the screens' own), as one list the checker walks:
 * which limit, which asset and point, the value, its day and when it was filled. With each form's
 * last day with an entry, for the "not filled" checks.
 *
 *   HSM  Mill Load Log Sheet: DC motor DE / NDE temperature; loading = load ÷ the stand's rated current;
 *        Bearing Temperature Details: gearbox bearings (D / ND side), lubrication-tank oil
 *   RMD  Mill Bearing Temperature, Oil Tank Temperature, Oil Tank Level (% of the tank's capacity);
 *        CCM Lolipop Sample: C, S, P, S + P
 *   LSM  Drive Temp: bearings, gearbox oil level and pressure; Mill Load Log Sheet: every pass's current
 *   RMS  Drive Temp: bearings, gearbox oil temperature and pressure
 *   all  MID vibration: each machine's highest H / V / A at a visit
 *        Daily production (mass yield, running rate, specific energy): only read when a limit is set,
 *        per completed plant day, exactly as Condition Analytics works them out.
 */
import type { Env } from '../../config/env';
import { LIMIT_DEFAULTS, type LimitMill } from '../../config/limits';
import { hsmMillLoad } from '../hsm/mill-load.service';
import { hsmBearingTemp } from '../hsm/bearing-temp.service';
import { istDate } from '../hsm/production.service';
import { hsmRatedCurrents } from '../forms-db/equipment.store';
import { rmdAlertReadings } from '../rmd/asset.service';
import { rmdChemistry } from '../rmd/chemistry.service';
import { lsmDriveTemp } from '../lsm/drive-temp.service';
import { lsmMillLoad } from '../lsm/mill-load.service';
import { rmsDriveTemp } from '../rms/drive-temp.service';
import { midReportLive } from '../mid/mid.service';
import { caActual } from '../ca/ca.service';

const DAY_MS = 86_400_000;
/** How far back readings are checked. */
export const WINDOW_DAYS = 45;
/** Daily figures: the last seven completed plant days. */
const DAILY_DAYS = 7;
/** When each mill's plant day starts, IST (the user's plant days). */
const DAY_START_MIN: Record<LimitMill, number> = { hsm: 8 * 60, rmd: 9 * 60, lsm: 9 * 60, rms: 9 * 60 + 30 };

export interface Reading {
  limitId: string;
  asset: string;
  point: string;
  value: number;
  /** The day the reading is for. */
  day: string;
  /** Sorts readings in the order they were taken: the day, then the time filled. */
  at: string;
  source: string;
}

/** A form a mill's readings come from: whether it could be read, its last day with an entry, how often it is filled. */
export interface Source {
  key: string;
  label: string;
  ok: boolean;
  message: string;
  lastDate: string | null;
  /** Days without an entry before "not filled" raises (shipped; the plant can change it). */
  expectDays: number;
}

/** The forms each mill is checked from, and how often each is filled. */
export const SOURCES: Record<LimitMill, { key: string; label: string; expectDays: number }[]> = {
  hsm: [
    { key: 'mill-load', label: 'Electrical HSM → Mill Load Log Sheet', expectDays: 2 },
    { key: 'bearing-temp', label: 'HSM Mechanical → Bearing Temperature Details', expectDays: 2 },
    { key: 'mid', label: 'MID Logbook → Vibration Reading', expectDays: 45 },
  ],
  rmd: [
    { key: 'bearings', label: 'TMT Mechanical → Mill Bearing Temperature', expectDays: 2 },
    { key: 'oil-temp', label: 'TMT Mechanical → Oil Tank Temperature', expectDays: 2 },
    // Filled every 15 days (the plant).
    { key: 'oil-level', label: 'TMT Mechanical → Oil Tank Level', expectDays: 20 },
    { key: 'chemistry', label: 'SMS → CCM Lolipop Sample (RMD)', expectDays: 2 },
    { key: 'mid', label: 'MID Logbook → Vibration Reading', expectDays: 45 },
  ],
  lsm: [
    { key: 'drive-temp', label: 'LSM Mechanical → Drive Temp', expectDays: 2 },
    { key: 'mill-load', label: 'LSM Electrical Logbook → Mill Load Log Sheet', expectDays: 2 },
    { key: 'mid', label: 'MID Logbook → Vibration Reading', expectDays: 45 },
  ],
  rms: [
    { key: 'drive-temp', label: 'RMS Mechanical → Drive Temp', expectDays: 2 },
    { key: 'mid', label: 'MID Logbook → Vibration Reading', expectDays: 45 },
  ],
};
const DAILY_SOURCE = { key: 'daily', label: 'ERP log sheet and the power form, per day', expectDays: 0 };
export const DAILY_IDS = ['mass-yield', 'running-rate', 'specific-energy'];

export interface Collected { readings: Reading[]; sources: Source[]; today: string; from: string }

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
/** "DRIVE03", "DRIVE 3", "Drive 03" → "Drive 03", so one drive is one series however it was typed. */
export const driveOf = (raw: string) => {
  const m = /^\s*drive\s*0*(\d+)\s*$/i.exec(raw);
  return m ? `Drive ${m[1].padStart(2, '0')}` : raw.trim();
};
const orderKey = (day: string, time: string | null | undefined) => `${day} ${time ?? ''}`.trim();
const fail = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Part = { readings: Reading[]; sources: Source[] };
const source = (mill: LimitMill, key: string, ok: boolean, message: string, lastDate: string | null): Source => {
  const def = SOURCES[mill].find((s) => s.key === key)!;
  return { ...def, ok, message, lastDate };
};

async function mid(env: Env, mill: LimitMill, from: string, to: string): Promise<Part> {
  const r = await midReportLive(env, mill, to);
  const readings: Reading[] = [];
  for (const v of r.visits) {
    if (v.date < from || v.date > to) continue;
    for (const m of v.machines) {
      if (m.maxMmS !== null) readings.push({ limitId: 'vibration', asset: m.machine, point: '', value: m.maxMmS, day: v.date, at: v.date, source: 'mid' });
    }
  }
  return { readings, sources: [source(mill, 'mid', true, 'Read', r.latest?.date ?? null)] };
}

async function hsm(env: Env, from: string, to: string): Promise<Part> {
  const [r, rated, bt] = await Promise.all([hsmMillLoad(env, from, to), hsmRatedCurrents(env).catch(() => new Map<string, number>()), hsmBearingTemp(env, from, to)]);
  const readings: Reading[] = [];
  for (const e of r.entries) {
    const at = orderKey(e.date, e.time);
    const base = { asset: e.stand, day: e.date, at, source: 'mill-load' };
    if (e.deTempC !== null) readings.push({ ...base, limitId: 'motor-bearing-temp', point: 'DE', value: e.deTempC });
    if (e.ndeTempC !== null) readings.push({ ...base, limitId: 'motor-bearing-temp', point: 'NDE', value: e.ndeTempC });
    const a = rated.get(e.stand);
    if (e.loadA !== null && a) readings.push({ ...base, limitId: 'motor-loading', point: '', value: Math.round((e.loadA / a) * 1000) / 10 });
  }
  for (const e of bt.entries) {
    const base = { day: e.date, at: orderKey(e.date, e.time), source: 'bearing-temp' };
    for (const b of e.bearings) {
      if (b.dC !== null) readings.push({ ...base, limitId: 'gearbox-bearing-temp', asset: b.unit, point: 'D side', value: b.dC });
      if (b.ndC !== null) readings.push({ ...base, limitId: 'gearbox-bearing-temp', asset: b.unit, point: 'ND side', value: b.ndC });
    }
    for (const t of e.tanks) if (t.tempC !== null) readings.push({ ...base, limitId: 'oil-temp', asset: `Lubrication tank ${t.tank}`, point: t.stands, value: t.tempC });
  }
  return {
    readings,
    sources: [
      source('hsm', 'mill-load', r.logbook.connection === 'up', r.logbook.message, r.lastDate),
      source('hsm', 'bearing-temp', bt.logbook.connection === 'up', bt.logbook.message, bt.lastDate),
    ],
  };
}

async function rmd(env: Env, from: string, to: string): Promise<Part> {
  const [a, chem] = await Promise.all([rmdAlertReadings(env, from, to), rmdChemistry(env, from, to)]);
  const readings: Reading[] = a.readings.map((r) => ({ ...r }));
  for (const s of [...chem.samples].reverse()) {
    const base = { asset: 'Lolipop sample', point: '', day: s.date, at: orderKey(s.date, s.time), source: 'chemistry' };
    if (s.c !== null) readings.push({ ...base, limitId: 'chem-c', value: s.c });
    if (s.s !== null) readings.push({ ...base, limitId: 'chem-s', value: s.s });
    if (s.p !== null) readings.push({ ...base, limitId: 'chem-p', value: s.p });
    if (s.s !== null && s.p !== null) readings.push({ ...base, limitId: 'chem-sp', value: Math.round((s.s + s.p) * 10_000) / 10_000 });
  }
  return {
    readings,
    sources: [
      source('rmd', 'bearings', a.ok, a.message, a.lastDate.bearings),
      source('rmd', 'oil-temp', a.ok, a.message, a.lastDate['oil-temp']),
      source('rmd', 'oil-level', a.ok, a.message, a.lastDate['oil-level']),
      source('rmd', 'chemistry', chem.logbook.connection === 'up', chem.logbook.message, chem.lastDate),
    ],
  };
}

async function lsm(env: Env, from: string, to: string): Promise<Part> {
  const [d, l] = await Promise.all([lsmDriveTemp(env, from, to), lsmMillLoad(env, from, to)]);
  const readings: Reading[] = [];
  for (const e of d.entries) {
    const base = { asset: driveOf(e.drive), day: e.date, at: orderKey(e.date, e.at), source: 'drive-temp' };
    const put = (limitId: string, point: string, v: number | null) => { if (v !== null) readings.push({ ...base, limitId, point, value: v }); };
    put('flywheel-temp', 'Flywheel DE', e.flywheelDeC); put('flywheel-temp', 'Flywheel NDE', e.flywheelNdeC);
    put('gearbox-bearing-temp', 'Reduction DE', e.reductionDeC); put('gearbox-bearing-temp', 'Reduction NDE', e.reductionNdeC);
    put('gearbox-bearing-temp', 'Pinion DE', e.pinionDeC); put('gearbox-bearing-temp', 'Pinion NDE', e.pinionNdeC);
    put('oil-pressure', 'Gearbox oil', e.oilPressure); put('oil-level', 'Gearbox oil', e.oilLevelIn);
  }
  for (const e of l.entries) {
    for (const p of e.passes) {
      if (p.loadA !== null) readings.push({ limitId: 'motor-current', asset: `Stand ${p.stand}`, point: `Pass ${p.pass}`, value: p.loadA, day: e.date, at: orderKey(e.date, e.time), source: 'mill-load' });
    }
  }
  return {
    readings,
    sources: [
      source('lsm', 'drive-temp', d.logbook.connection === 'up', d.logbook.message, d.lastDate),
      source('lsm', 'mill-load', l.logbook.connection === 'up', l.logbook.message, l.lastDate),
    ],
  };
}

async function rms(env: Env, from: string, to: string): Promise<Part> {
  const d = await rmsDriveTemp(env, from, to);
  const readings: Reading[] = [];
  for (const e of d.entries) {
    const base = { asset: driveOf(e.drive), day: e.date, at: orderKey(e.date, e.at), source: 'drive-temp' };
    for (const b of e.bearings) {
      readings.push({ ...base, limitId: b.component === 'Flywheel' ? 'flywheel-temp' : 'gearbox-bearing-temp', point: `${b.component} · ${b.point}`, value: b.valueC });
    }
    if (e.oilTempC !== null) readings.push({ ...base, limitId: 'oil-temp', point: 'Gearbox oil', value: e.oilTempC });
    if (e.oilPressure !== null) readings.push({ ...base, limitId: 'oil-pressure', point: 'Gearbox oil', value: e.oilPressure });
  }
  return { readings, sources: [source('rms', 'drive-temp', d.logbook.connection === 'up', d.logbook.message, d.lastDate)] };
}

/** Daily figures for the last completed plant days, one reading per day and figure. */
async function daily(env: Env, mill: LimitMill, yesterday: string, ids: string[]): Promise<Part> {
  const days = Array.from({ length: DAILY_DAYS }, (_, i) => addDays(yesterday, -(DAILY_DAYS - 1 - i)));
  const asset = mill.toUpperCase();
  const read = await Promise.all(days.map((d) => caActual(env, mill, d, d).then((a) => ({ d, a }))));
  const readings: Reading[] = [];
  for (const { d, a } of read) {
    const put = (id: string, v: number | null) => {
      if (ids.includes(id) && v !== null && Number.isFinite(v)) readings.push({ limitId: id, asset, point: 'per day', value: Math.round(v * 100) / 100, day: d, at: d, source: 'daily' });
    };
    put('mass-yield', a.yieldPct); put('running-rate', a.rateTph); put('specific-energy', a.kwhPerMt);
  }
  return { readings, sources: [] };
}

/** A part that failed whole: no readings, its forms said to be unreadable. */
const failed = (mill: LimitMill, keys: string[], e: unknown): Part =>
  ({ readings: [], sources: keys.map((k) => source(mill, k, false, fail(e), null)) });

/**
 * Every reading of the mill over the last WINDOW_DAYS, oldest first, and its forms. `dailyIds`: the
 * daily figures with a limit set (none: they are not read at all).
 */
export async function collect(env: Env, mill: LimitMill, dailyIds: string[], nowMs = Date.now()): Promise<Collected> {
  const today = istDate(nowMs);
  const from = addDays(today, -WINDOW_DAYS);
  const yesterday = istDate(nowMs - DAY_START_MIN[mill] * 60_000 - DAY_MS);
  const own = SOURCES[mill].filter((s) => s.key !== 'mid').map((s) => s.key);
  const mine = mill === 'hsm' ? hsm(env, from, today) : mill === 'rmd' ? rmd(env, from, today) : mill === 'lsm' ? lsm(env, from, today) : rms(env, from, today);
  const parts = await Promise.all([
    mine.catch((e) => failed(mill, own, e)),
    mid(env, mill, from, today).catch((e) => failed(mill, ['mid'], e)),
    dailyIds.length
      ? daily(env, mill, yesterday, dailyIds).catch((e): Part => ({ readings: [], sources: [{ ...DAILY_SOURCE, ok: false, message: fail(e), lastDate: null }] }))
      : Promise.resolve<Part>({ readings: [], sources: [] }),
  ]);
  const readings = parts.flatMap((p) => p.readings)
    .filter((r) => LIMIT_DEFAULTS[mill].some((d) => d.id === r.limitId))
    .sort((a, b) => a.at.localeCompare(b.at));
  return { readings, sources: parts.flatMap((p) => p.sources), today, from };
}
