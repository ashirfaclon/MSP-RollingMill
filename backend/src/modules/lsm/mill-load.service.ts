/**
 * LSM motor current from the logbook's "Light Structure Mill → Electrical Logbook → Mill Load Log
 * Sheet" (electrical-logbook/mill-load-log-sheet), the motor current form the plant named (23 Oct
 * 2026). One entry is the whole mill at one time: the load (A) of each pass, by stand —
 *   stand 1 passes 1–4, stand 2 pass 5, stand 3 pass 6 … stand 7 pass 10
 * (fields stand-<s>-pass-<p>-amp). An entry belongs to the form's date ("date-and-time" holds
 * the date; "time" orders two entries of one day). An entry remarked "test" is left out. Read fresh
 * from the logbook; submissions from a month before the period.
 */
import type { Env } from '../../config/env';
import type { LsmMillLoadReading, LsmMillLoadReport, LsmPassLoad } from '../../contracts';
import { fetchFormEntries, num, type InsightEntry } from '../../integrations/logbook/client';
import { MSG } from '../../shared/messages';
import { round2 } from '../hsm/production.service';

export const LSM_MILL_LOAD_FORM = 'electrical-logbook/mill-load-log-sheet';
const LOOK_BACK_MS = 31 * 86_400_000;
/** How far back to look for the last entry when the period and its month before have none. */
const LAST_ENTRY_LOOK_BACK_MS = 183 * 86_400_000;
const PASS_FIELD = /^stand-(\d+)-pass-(\d+)-amp$/;

export function toReading(r: InsightEntry): LsmMillLoadReading | null {
  const res = r.result ?? {};
  if (/\btest\b/i.test(String(res['remarks'] ?? ''))) return null;
  const date = String(res['date-and-time'] ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  // Every stand-pass field the form has, in stand then pass order.
  const passes: LsmPassLoad[] = Object.keys(res)
    .map((k) => PASS_FIELD.exec(k))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ stand: Number(m[1]), pass: Number(m[2]), loadA: num(res[m[0]]) }))
    .sort((a, b) => a.stand - b.stand || a.pass - b.pass);
  const loads = passes.map((p) => p.loadA).filter((v): v is number => v !== null);
  return {
    date,
    time: res['time'] ? String(res['time']) : null,
    section: String(res['section'] ?? '').trim(),
    billetSize: String(res['billet-size'] ?? '').trim(),
    passes,
    meanA: loads.length ? round2(loads.reduce((a, b) => a + b, 0) / loads.length) : null,
  };
}

/** Oldest first: by the form's date, then its time. */
const order = (a: LsmMillLoadReading, b: LsmMillLoadReading) =>
  a.date !== b.date ? a.date.localeCompare(b.date) : (a.time ?? '').localeCompare(b.time ?? '');

/** The latest date up to `to` with a pass load; null with none. */
export function lastReadingDate(readings: LsmMillLoadReading[], to: string): string | null {
  return readings.filter((e) => e.meanA !== null && e.date <= to)
    .reduce<string | null>((a, e) => (a === null || e.date > a ? e.date : a), null);
}

export async function lsmMillLoad(env: Env, from: string, to: string): Promise<LsmMillLoadReport> {
  const startMs = Date.parse(`${from}T00:00:00+05:30`);
  const read = await fetchFormEntries(LSM_MILL_LOAD_FORM, startMs - LOOK_BACK_MS, env);
  const all = read.ok ? read.rows.map(toReading).filter((e): e is LsmMillLoadReading => e !== null) : [];
  const entries = all
    .filter((e) => e.date >= from && e.date <= to)
    .sort(order);
  /* The last day with a reading, up to the period end — from what was read, else once more further back. */
  let lastDate = lastReadingDate(all, to);
  if (lastDate === null && read.ok) {
    const older = await fetchFormEntries(LSM_MILL_LOAD_FORM, startMs - LAST_ENTRY_LOOK_BACK_MS, env).catch(() => null);
    if (older?.ok) lastDate = lastReadingDate(older.rows.map(toReading).filter((e): e is LsmMillLoadReading => e !== null), to);
  }
  return {
    from, to, form: LSM_MILL_LOAD_FORM,
    logbook: { connection: read.ok ? 'up' : 'down', message: read.ok ? MSG.LOGBOOK_UP : read.message },
    latest: entries.at(-1) ?? null,
    entries,
    lastDate,
  };
}
