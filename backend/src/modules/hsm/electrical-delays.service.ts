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
 * The logbook engine returns every form's entries newest first, so the reader pages from the
 * top until it is a week before the period (entries are typed days late), and keeps what it
 * read for a few minutes.
 */
import type { Env } from '../../config/env';
import type { ElectricalDelay, ElectricalDelaysReport } from '../../contracts';
import { fetchInsightPage } from '../../integrations/logbook/client';
import { MSG } from '../../shared/messages';
import { round2 } from './production.service';

export const DELAYS_FORM = 'electrical-hsm/electrical-delays';
const DAY_MS = 86_400_000;
const ENTRY_LAG_MS = 7 * DAY_MS;
const FRESH_MS = 3 * 60_000;
const MAX_PAGES = 200;

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

const read: { rows: (ElectricalDelay & { createdMs: number })[]; reachedMs: number; at: number; up: boolean; message: string } = {
  rows: [], reachedMs: Infinity, at: 0, up: false, message: MSG.LOGBOOK_NOT_MAPPED,
};

async function ensure(env: Env, sinceMs: number) {
  if (read.reachedMs <= sinceMs && Date.now() - read.at < FRESH_MS) return;
  const rows: typeof read.rows = [];
  let reached = Infinity;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const p = await fetchInsightPage(page, env);
    if (!p.ok) { read.up = false; read.message = p.message; return; }
    read.up = true; read.message = MSG.LOGBOOK_UP;
    for (const r of p.rows) {
      const tag = String((r.tags ?? [])[0] ?? r.resultName ?? '');
      const createdMs = Date.parse(r.createdAt ?? r.invocationTime ?? '');
      if (Number.isFinite(createdMs)) reached = Math.min(reached, createdMs);
      if (tag !== DELAYS_FORM) continue;
      const res = r.result ?? {};
      const details = String(res['fault-details'] ?? '').trim();
      if (!details) continue;   // a day entered as "no breakdown"
      const stands = standsOf(details);
      rows.push({
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
      });
    }
    if (p.rows.length === 0 || reached < sinceMs) break;
  }
  read.rows = rows;
  read.reachedMs = reached;
  read.at = Date.now();
}

export async function electricalDelays(env: Env, from: string, to: string): Promise<ElectricalDelaysReport> {
  await ensure(env, Date.parse(`${from}T00:00:00+05:30`) - ENTRY_LAG_MS);
  const delays = read.rows.filter((d) => d.date >= from && d.date <= to)
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
    logbook: { connection: read.up ? 'up' : 'down', message: read.message },
    delays,
    totals: { all: totals('all'), roughing: totals('roughing'), finishing: totals('finishing') },
  };
}
