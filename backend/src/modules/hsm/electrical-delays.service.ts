/**
 * HSM electrical delays from the IOsense logbook, "Electrical HSM → Electrical Delays"
 * (electrical-hsm/electrical-delays): one entry per fault with its date, shift, time from /
 * to, duration (HH:MM:SS) and fault details. Days with no fault are entered too ("NO ANY
 * ELECTRICAL BREAKDOWN…") — those carry no fault details and are not faults.
 *
 * The stands a fault names (R1–R5 roughing, F1–F6 finishing, e.g. "F1,F2&F5 DRIVE TRIPPED")
 * place it in a group; one naming none goes by "finishing / roughing mill" in its text, else
 * (billet heater, conveyor) has no group.
 *
 * Each request reads the form fresh from the logbook (shared for 30 s), so an entry deleted or
 * corrected there is gone or changed on the next refresh. Entries are typed days late, so the
 * read takes everything submitted from a month before the period.
 */
import type { Env } from '../../config/env';
import type { ElectricalDelay, ElectricalDelaysReport } from '../../contracts';
import { fetchFormEntries, type InsightEntry } from '../../integrations/logbook/client';
import { MSG } from '../../shared/messages';
import { round2 } from './production.service';

export const DELAYS_FORM = 'electrical-hsm/electrical-delays';
const DAY_MS = 86_400_000;
const LOOK_BACK_MS = 31 * DAY_MS;

/** "00:20:00" → 20 (minutes); null when empty or unreadable. */
export function minutesOf(duration: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(duration ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3]) / 60 : 0) : null;
}

/** Stands a fault names: "F1,F2&F5" → F1, F2, F5; "R5" → R5. */
export function standsOf(details: string): string[] {
  return [...new Set([...details.toUpperCase().matchAll(/(?<![A-Z0-9])([RF])\s?([1-6])(?![0-9])/g)].map((m) => `${m[1]}${m[2]}`))].sort();
}

/** The group from the stands named; a fault naming none but "finishing / roughing mill" goes there. */
export function groupOf(stands: string[], details = ''): ElectricalDelay['group'] {
  const d = details.toUpperCase();
  const r = stands.some((s) => s.startsWith('R')) || (!stands.length && /ROUGHING MILL/.test(d));
  const f = stands.some((s) => s.startsWith('F')) || (!stands.length && /FINISHING MILL/.test(d));
  return r && f ? 'both' : r ? 'roughing' : f ? 'finishing' : null;
}

type Row = ElectricalDelay & { createdMs: number };

function toRow(r: InsightEntry): Row | null {
  const res = r.result ?? {};
  const details = String(res['fault-details'] ?? '').trim();
  if (!details) return null;   // a day entered as "no breakdown"
  const stands = standsOf(details);
  const createdMs = Date.parse(r.createdAt ?? r.invocationTime ?? '');
  return {
    date: String(res['date'] ?? '').slice(0, 10),
    shift: String(res['shift'] ?? ''),
    section: String(res['section'] ?? ''),
    timeFrom: String(res['time-from'] ?? '') || null,
    timeTo: String(res['time-to'] ?? '') || null,
    minutes: minutesOf(res['duration']),
    details,
    stands,
    group: groupOf(stands, details),
    createdMs: Number.isFinite(createdMs) ? createdMs : 0,
  };
}

export async function electricalDelays(env: Env, from: string, to: string): Promise<ElectricalDelaysReport> {
  const read = await fetchFormEntries(DELAYS_FORM, Date.parse(`${from}T00:00:00+05:30`) - LOOK_BACK_MS, env);
  const rows = read.ok ? read.rows.map(toRow).filter((r): r is Row => r !== null) : [];
  const delays = rows.filter((d) => d.date >= from && d.date <= to)
    .map(({ createdMs: _c, ...d }) => d)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.timeFrom).localeCompare(String(a.timeFrom)));
  const totals = (g: ElectricalDelay['group'] | 'all') => {
    const mine = delays.filter((d) => g === 'all' || d.group === g || (d.group === 'both' && g !== null));
    const timed = mine.filter((d) => d.minutes !== null);
    const minutes = timed.reduce((a, d) => a + d.minutes!, 0);
    return { faults: mine.length, minutes: round2(minutes), mttrMin: timed.length ? round2(minutes / timed.length) : null };
  };
  return {
    from, to, form: DELAYS_FORM,
    logbook: { connection: read.ok ? 'up' : 'down', message: read.ok ? MSG.LOGBOOK_UP : read.message },
    delays,
    totals: { all: totals('all'), roughing: totals('roughing'), finishing: totals('finishing') },
  };
}
