/**
 * LSM Asset Health from the logbook's "Light Structure Mill → LSM Mechanical → Drive Temp"
 * (lsm-mechanical/drive-temp), the "mechanical log book" of the LSM asset health sheet (the user,
 * 22 Oct 2026). One entry per drive and reading:
 *   Bearing temp   flywheel, reduction gearbox and pinion gearbox bearings, DE and NDE, °C;
 *   Gearbox oil    level (inches, shown as filled) and pressure (kg/cm²).
 * The form has one date-time and no separate Date: a reading belongs to the LSM mill day of that
 * date-time (09:00 → 09:00 IST). An entry remarked "test" is left out. Read fresh from the
 * logbook; submissions from a month before the period.
 */
import type { Env } from '../../config/env';
import type { LsmDriveReading, LsmDriveReport } from '../../contracts';
import { fetchFormEntries, num, type InsightEntry } from '../../integrations/logbook/client';
import { MSG } from '../../shared/messages';

export const DRIVE_TEMP_FORM = 'lsm-mechanical/drive-temp';
const LOOK_BACK_MS = 31 * 86_400_000;
/** How far back to look for the last entry when the period and its month before have none. */
const LAST_ENTRY_LOOK_BACK_MS = 183 * 86_400_000;
const DAY_START_HOUR = 9;

/** "2026-10-22T02:00:00" → "2026-10-21": before 09:00 is the previous mill day. */
export function millDayOf(at: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})/.exec(at);
  if (!m) return null;
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number(m[4]) < DAY_START_HOUR) day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

export function toReading(r: InsightEntry): LsmDriveReading | null {
  const res = r.result ?? {};
  if (/\btest\b/i.test(String(res['remarks'] ?? ''))) return null;
  const at = String(res['date-time'] ?? '');
  const date = millDayOf(at);
  if (!date) return null;
  return {
    date, at,
    shift: String(res['shift'] ?? ''),
    drive: String(res['drive-name'] ?? '').trim(),
    flywheelDeC: num(res['flywheel-bearing-de-side-temp-c']),
    flywheelNdeC: num(res['flywheel-bearing-nde-side-temp-c']),
    reductionDeC: num(res['reduction-gearbox-bearingtemp-c-de']),
    reductionNdeC: num(res['reduction-gearbox-bearingtemp-c-nde']),
    pinionDeC: num(res['pinion-gearbox-temp-c-de']),
    pinionNdeC: num(res['pinion-gearbox-temp-c-nde']),
    oilPressure: num(res['oil-pressure-kg-cm2']),
    oilLevelIn: num(res['oil-level-inches']),
  };
}

/** Each drive's latest reading by its date-time, drives in natural order (DRIVE01, DRIVE02 …). */
export function latestByDrive(entries: LsmDriveReading[]): LsmDriveReading[] {
  const by = new Map<string, LsmDriveReading>();
  for (const e of entries) {
    const cur = by.get(e.drive);
    if (!cur || e.at > cur.at) by.set(e.drive, e);
  }
  return [...by.values()].sort((a, b) => a.drive.localeCompare(b.drive, undefined, { numeric: true }));
}

/** The latest mill day up to `to` with a bearing temperature, oil level or oil pressure; null with none. */
export function lastReadingDate(readings: LsmDriveReading[], to: string): string | null {
  const used = (e: LsmDriveReading) => [e.flywheelDeC, e.flywheelNdeC, e.reductionDeC, e.reductionNdeC, e.pinionDeC, e.pinionNdeC, e.oilPressure, e.oilLevelIn]
    .some((v) => v !== null);
  return readings.filter((e) => used(e) && e.date <= to)
    .reduce<string | null>((a, e) => (a === null || e.date > a ? e.date : a), null);
}

export async function lsmDriveTemp(env: Env, from: string, to: string): Promise<LsmDriveReport> {
  const startMs = Date.parse(`${from}T00:00:00+05:30`);
  const read = await fetchFormEntries(DRIVE_TEMP_FORM, startMs - LOOK_BACK_MS, env);
  const all = read.ok ? read.rows.map(toReading).filter((e): e is LsmDriveReading => e !== null) : [];
  const entries = all
    .filter((e) => e.date >= from && e.date <= to)
    .sort((a, b) => a.at.localeCompare(b.at));
  /* The last day with a reading, up to the period end — from what was read, else once more further back. */
  let lastDate = lastReadingDate(all, to);
  if (lastDate === null && read.ok) {
    const older = await fetchFormEntries(DRIVE_TEMP_FORM, startMs - LAST_ENTRY_LOOK_BACK_MS, env).catch(() => null);
    if (older?.ok) lastDate = lastReadingDate(older.rows.map(toReading).filter((e): e is LsmDriveReading => e !== null), to);
  }
  return {
    from, to, form: DRIVE_TEMP_FORM,
    logbook: { connection: read.ok ? 'up' : 'down', message: read.ok ? MSG.LOGBOOK_UP : read.message },
    latest: latestByDrive(entries),
    entries,
    lastDate,
  };
}
