/**
 * HSM Asset Health from the logbook's "Electrical HSM → Mill Load Log Sheet"
 * (electrical-hsm/mill-load-log-sheet), as the HSM source sheet names it (HSM source KPI.xlsx,
 * Asset Health): one entry per stand and reading —
 *   Motor current loading   load in amp (`load-in-amp`); as % once each motor's rated current is given;
 *   Bearing temperature     DC motor DE and NDE temperature (`dc-motor-de-temp`, `dc-motor-nde-temp`), °C.
 * The stand name places a reading in its group: RM n → roughing, FM n → finishing. An entry
 * remarked "test" is left out. Read fresh from the logbook; submissions from a month before the
 * period, placed by the form's Date.
 */
import type { Env } from '../../config/env';
import type { HsmMillLoadEntry, HsmMillLoadReport } from '../../contracts';
import { fetchFormEntries, num, type InsightEntry } from '../../integrations/logbook/client';
import { MSG } from '../../shared/messages';

export const MILL_LOAD_FORM = 'electrical-hsm/mill-load-log-sheet';
const LOOK_BACK_MS = 31 * 86_400_000;
/** How far back to look for the last entry when the period and its month before have none. */
const LAST_ENTRY_LOOK_BACK_MS = 183 * 86_400_000;

/** "RM 4", "rm-4", "R4" → { stand: "RM 4", group: roughing }; "FM 2" → finishing; anything else → no group. */
export function standOf(raw: unknown): { stand: string; group: HsmMillLoadEntry['group'] } {
  const s = String(raw ?? '').trim();
  const m = /^(R|F)M?\s*[-_ ]?\s*0*(\d+)$/i.exec(s);
  if (!m) return { stand: s, group: null };
  const roughing = m[1].toUpperCase() === 'R';
  return { stand: `${roughing ? 'RM' : 'FM'} ${m[2]}`, group: roughing ? 'roughing' : 'finishing' };
}

export function toEntry(r: InsightEntry): HsmMillLoadEntry | null {
  const res = r.result ?? {};
  if (/\btest\b/i.test(String(res['remarks'] ?? ''))) return null;
  const date = String(res['date'] ?? '').slice(0, 10);
  if (!date) return null;
  const { stand, group } = standOf(res['stand-name']);
  return {
    date, time: res['time'] ? String(res['time']) : null, shift: String(res['shift'] ?? ''),
    stand, group,
    loadA: num(res['load-in-amp']),
    deTempC: num(res['dc-motor-de-temp']),
    ndeTempC: num(res['dc-motor-nde-temp']),
  };
}

/** Later reading first by its Date, then by its time. */
const later = (a: HsmMillLoadEntry, b: HsmMillLoadEntry) =>
  a.date !== b.date ? a.date > b.date : (a.time ?? '') > (b.time ?? '');

/** Each stand's latest reading of the period. */
export function latestByStand(entries: HsmMillLoadEntry[]): HsmMillLoadEntry[] {
  const by = new Map<string, HsmMillLoadEntry>();
  for (const e of entries) {
    const cur = by.get(e.stand);
    if (!cur || later(e, cur)) by.set(e.stand, e);
  }
  return [...by.values()].sort((a, b) => a.stand.localeCompare(b.stand, undefined, { numeric: true }));
}

/** The latest Date up to `to` with a load or motor temperature reading; null with none. */
export function lastReadingDate(entries: HsmMillLoadEntry[], to: string): string | null {
  return entries.filter((e) => (e.loadA !== null || e.deTempC !== null || e.ndeTempC !== null) && e.date <= to)
    .reduce<string | null>((a, e) => (a === null || e.date > a ? e.date : a), null);
}

export async function hsmMillLoad(env: Env, from: string, to: string): Promise<HsmMillLoadReport> {
  const startMs = Date.parse(`${from}T00:00:00+05:30`);
  const read = await fetchFormEntries(MILL_LOAD_FORM, startMs - LOOK_BACK_MS, env);
  const all = read.ok ? read.rows.map(toEntry).filter((e): e is HsmMillLoadEntry => e !== null) : [];
  const entries = all
    .filter((e) => e.date >= from && e.date <= to)
    .sort((a, b) => (later(a, b) ? 1 : later(b, a) ? -1 : 0));
  /* The last day with a reading, up to the period end — from what was read, else once more further back. */
  let lastDate = lastReadingDate(all, to);
  if (lastDate === null && read.ok) {
    const older = await fetchFormEntries(MILL_LOAD_FORM, startMs - LAST_ENTRY_LOOK_BACK_MS, env).catch(() => null);
    if (older?.ok) lastDate = lastReadingDate(older.rows.map(toEntry).filter((e): e is HsmMillLoadEntry => e !== null), to);
  }
  return {
    from, to, form: MILL_LOAD_FORM,
    logbook: { connection: read.ok ? 'up' : 'down', message: read.ok ? MSG.LOGBOOK_UP : read.message },
    latest: latestByStand(entries),
    entries,
    lastDate,
  };
}
