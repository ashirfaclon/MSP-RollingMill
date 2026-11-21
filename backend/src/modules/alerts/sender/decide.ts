/**
 * What is news (SMS-ALERTS.md §6.1, SETTINGS_AND_ALERTS_REPLICATION.md §8.2). Pure: the alarms of
 * every mill as the checker lists them now, and what the sender remembers, in; the messages to send
 * and what to remember, out.
 *
 *   - Only a limit crossing that is active, not muted, and at or above its alert's "messages from" is
 *     told. Data checks (not filled, typing slips, can't be read) never are (the user, 21 Nov 2026).
 *   - A crossing is the alarm's `episode` (its key and when it started) — nothing from a reading or a
 *     time, so the same crossing is never news twice.
 *   - raised:   a new crossing, to level 1.
 *   - repeated: only with one message per crossing off — level 1 again every N minutes; each later
 *               level first after its own N minutes, then every N; a level with 0 is told once, with
 *               the first alert. Repeats stop when the crossing is no longer active.
 *   - Nothing is sent on recovery: the alarm drops out of what is remembered, and re-arms.
 *   - A crossing first seen muted, or on the first look (cold start), is remembered silently, so a
 *     restart or un-muting never sends an old crossing. One first seen below "messages from" is told
 *     if it later rises to it (warning → critical after a week out).
 *   - A mill whose checker failed keeps what is remembered of it, so the next good read re-raises nothing.
 */
import type { Alarm, AlertSeverity, MillEscalation } from '../../../contracts';
import type { LimitMill } from '../../../config/limits';
import { eventOf, type AlertEvent } from './message';

/** One crossing the sender remembers. */
export interface OpenAlert {
  key: string;
  episode: string;
  mill: LimitMill;
  /** When the sender first saw it. */
  seenAt: string;
  /** Why nothing was sent for it; null when it was told. */
  silent: 'primed' | 'muted' | 'below' | null;
  /** Each level told, and when it was last told. */
  told: { level: number; at: string }[];
}

/** One mill as the checker read it this tick. */
export interface MillRead {
  mill: LimitMill;
  /** False: the checker failed — what is remembered of the mill is kept as it was. */
  ok: boolean;
  alarms: Alarm[];
  escalation: MillEscalation;
  /** Each alert's "messages from". */
  floorOf: (ruleId: string) => AlertSeverity;
}

const RANK: Record<AlertSeverity, number> = { data: 0, warning: 1, critical: 2 };
/** A tick is not exact: a level is due this much early rather than a whole tick late. */
const SLACK_MS = 5_000;

/** Whether an active alarm sends a message, and if not, why. */
export function wantOf(a: Alarm, floorOf: (ruleId: string) => AlertSeverity): 'send' | 'muted' | 'below' {
  if (a.muted) return 'muted';
  if (a.kind !== 'limit' || a.severity === 'data') return 'below';
  return RANK[a.severity] >= RANK[floorOf(a.ruleId)] ? 'send' : 'below';
}

export function decide(prev: { primedAt: string | null; open: OpenAlert[] }, reads: MillRead[], now: string): { events: AlertEvent[]; open: OpenAlert[]; primedAt: string } {
  const nowMs = Date.parse(now);
  const priming = prev.primedAt === null;
  const before = new Map(prev.open.map((o) => [o.key, o]));
  const open: OpenAlert[] = [];
  const events: AlertEvent[] = [];

  for (const m of reads) {
    if (!m.ok) { open.push(...prev.open.filter((o) => o.mill === m.mill)); continue; }
    const esc = m.escalation;
    // One row per alarm key; if the checker ever lists one twice, the worst counts.
    const byKey = new Map<string, Alarm>();
    for (const a of m.alarms) {
      if (!a.active) continue;
      const cur = byKey.get(a.key);
      if (!cur || RANK[a.severity] > RANK[cur.severity]) byKey.set(a.key, a);
    }
    for (const a of byKey.values()) {
      const was = before.get(a.key);
      const want = wantOf(a, m.floorOf);
      const raise = (entry: OpenAlert) => {
        events.push(eventOf(a, m.mill, esc, 1, 'raised', a.episode, null, now));
        entry.silent = null;
        entry.told = [{ level: 1, at: now }];
        // Every-0 later levels are told with the first alert (only when levels escalate at all).
        if (!esc.onePerCrossing) {
          esc.levels.forEach((lv, i) => {
            if (i === 0 || lv.everyMinutes !== 0) return;
            events.push(eventOf(a, m.mill, esc, i + 1, 'repeated', `${a.episode}~L${i + 1}@${now}`, a.episode, now));
            entry.told.push({ level: i + 1, at: now });
          });
        }
      };

      if (!was || was.episode !== a.episode) {
        // A new crossing (or the first look).
        const entry: OpenAlert = { key: a.key, episode: a.episode, mill: m.mill, seenAt: now, silent: priming ? 'primed' : want === 'send' ? null : want, told: [] };
        if (!priming && want === 'send') raise(entry);
        open.push(entry);
        continue;
      }

      const entry: OpenAlert = { ...was, told: was.told.map((t) => ({ ...t })) };
      open.push(entry);
      if (entry.silent !== null) {
        // Rose to "messages from" since it was first seen: news now. Muted or primed stays quiet.
        if (entry.silent === 'below' && want === 'send') raise(entry);
        else if (want === 'muted' && entry.silent === 'below') entry.silent = 'muted';
        continue;
      }
      if (esc.onePerCrossing || want !== 'send') continue;
      const raisedMs = Date.parse(entry.seenAt);
      esc.levels.forEach((lv, i) => {
        const level = i + 1;
        const last = entry.told.find((t) => t.level === level);
        const every = lv.everyMinutes * 60_000;
        let due: boolean;
        if (every === 0) due = !last;
        else if (!last) due = level > 1 && nowMs - raisedMs >= every - SLACK_MS;
        else due = nowMs - Date.parse(last.at) >= every - SLACK_MS;
        if (!due) return;
        events.push(eventOf(a, m.mill, esc, level, 'repeated', `${a.episode}~L${level}@${now}`, a.episode, now));
        if (last) last.at = now; else entry.told.push({ level, at: now });
      });
    }
  }
  return { events, open, primedAt: prev.primedAt ?? now };
}
