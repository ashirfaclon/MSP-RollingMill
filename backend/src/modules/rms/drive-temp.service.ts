/**
 * RMS Asset Health from the logbook's "Rolling Mill Structure (RMS) → RMS Mechanical → Drive Temp"
 * (rms-mechanical/drive-temp; the user, 31 Oct 2026). One entry per drive and reading:
 *   Bearing temp   reduction gearbox 1 and 2 (input / output, inside / outside), pinion (top / centre /
 *                  bottom, inside / outside) and flywheel (input / output), °C;
 *   Gearbox oil    temperature (°C) and pressure.
 * The form has one date-time and no separate Date: a reading belongs to the RMS mill day of that
 * date-time (09:30 → 09:30 IST). An entry remarked "test" is left out. Read fresh from the logbook.
 */
import type { Env } from '../../config/env';
import type { RmsDriveReading, RmsDriveReport } from '../../contracts';
import { fetchFormEntries, num, type InsightEntry } from '../../integrations/logbook/client';
import { MSG } from '../../shared/messages';

export const RMS_DRIVE_TEMP_FORM = 'rms-mechanical/drive-temp';
const LOOK_BACK_MS = 31 * 86_400_000;
/** How far back to look for the last entry when the period and its month before have none. */
const LAST_ENTRY_LOOK_BACK_MS = 183 * 86_400_000;
/** The RMS mill day starts at 09:30 IST. */
const DAY_START_MIN = 9 * 60 + 30;

/** "2026-10-30T09:00:00" → "2026-10-29": before 09:30 is the previous mill day. */
export function rmsMillDayOf(at: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(at);
  if (!m) return null;
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number(m[4]) * 60 + Number(m[5]) < DAY_START_MIN) day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A bearing field → its component and point, from the form's keys:
 *   rg1-input-inside-temp → Reduction gearbox 1 · Input inside;  pinion-center-outside-temp → Pinion · Centre outside;
 *   flywheel-input-temp → Flywheel · Input. Anything else (oil, names, shift) is not a bearing.
 */
export function rmsBearingOf(field: string): { component: string; point: string } | null {
  let m = /^rg(\d)-(input|output)-(inside|outside)-temp$/.exec(field);
  if (m) return { component: `Reduction gearbox ${m[1]}`, point: `${cap(m[2])} ${m[3]}` };
  m = /^pinion-(top|center|centre|bottom)-(inside|outside)-temp$/.exec(field);
  if (m) return { component: 'Pinion', point: `${m[1] === 'center' ? 'Centre' : cap(m[1])} ${m[2]}` };
  m = /^flywheel-(input|output)-temp$/.exec(field);
  if (m) return { component: 'Flywheel', point: cap(m[1]) };
  return null;
}

export function toRmsReading(r: InsightEntry): RmsDriveReading | null {
  const res = r.result ?? {};
  if (/\btest\b/i.test(String(res['remarks'] ?? ''))) return null;
  const at = String(res['date-time'] ?? '');
  const date = rmsMillDayOf(at);
  if (!date) return null;
  const bearings = Object.entries(res).flatMap(([field, v]) => {
    const b = rmsBearingOf(field);
    const c = num(v);
    return b && c !== null ? [{ ...b, valueC: c }] : [];
  });
  return {
    date, at,
    shift: String(res['shift'] ?? ''),
    drive: String(res['drive-name'] ?? '').trim(),
    bearings,
    oilTempC: num(res['oil-temp']),
    oilPressure: num(res['oil-pressure-level']),
  };
}

/** Each drive's latest reading by its date-time, drives in natural order. */
export function rmsLatestByDrive(entries: RmsDriveReading[]): RmsDriveReading[] {
  const by = new Map<string, RmsDriveReading>();
  for (const e of entries) {
    const cur = by.get(e.drive);
    if (!cur || e.at > cur.at) by.set(e.drive, e);
  }
  return [...by.values()].sort((a, b) => a.drive.localeCompare(b.drive, undefined, { numeric: true }));
}

const used = (e: RmsDriveReading) => e.bearings.length > 0 || e.oilTempC !== null || e.oilPressure !== null;

/** The latest mill day up to `to` with any reading; null with none. */
export function rmsLastReadingDate(readings: RmsDriveReading[], to: string): string | null {
  return readings.filter((e) => used(e) && e.date <= to).reduce<string | null>((a, e) => (a === null || e.date > a ? e.date : a), null);
}

export async function rmsDriveTemp(env: Env, from: string, to: string): Promise<RmsDriveReport> {
  const startMs = Date.parse(`${from}T00:00:00+05:30`);
  const read = await fetchFormEntries(RMS_DRIVE_TEMP_FORM, startMs - LOOK_BACK_MS, env);
  const all = read.ok ? read.rows.map(toRmsReading).filter((e): e is RmsDriveReading => e !== null) : [];
  const entries = all.filter((e) => e.date >= from && e.date <= to).sort((a, b) => a.at.localeCompare(b.at));
  let lastDate = rmsLastReadingDate(all, to);
  if (lastDate === null && read.ok) {
    const older = await fetchFormEntries(RMS_DRIVE_TEMP_FORM, startMs - LAST_ENTRY_LOOK_BACK_MS, env).catch(() => null);
    if (older?.ok) lastDate = rmsLastReadingDate(older.rows.map(toRmsReading).filter((e): e is RmsDriveReading => e !== null), to);
  }
  return {
    from, to, form: RMS_DRIVE_TEMP_FORM,
    logbook: { connection: read.ok ? 'up' : 'down', message: read.ok ? MSG.LOGBOOK_UP : read.message },
    latest: rmsLatestByDrive(entries),
    entries,
    lastDate,
  };
}
