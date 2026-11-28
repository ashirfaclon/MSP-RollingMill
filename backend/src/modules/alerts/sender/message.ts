/**
 * What the webhook receives — one message per event, in the Melt Shop's shape (docs/SMS-ALERTS.md §7.2)
 * so the same kind of n8n workflow sends it, plus the department (the user, 21 Nov 2026: one webhook
 * for every mill, each message names its department).
 *
 * The workflow should rely on:
 *   smsTo / whatsappTo / emailTo   this message's level's contacts, switched-off channels emptied: send to exactly these
 *   subject + body                 ready-made text; the body is always the same 7 lines, a missing figure prints NA
 *   id                             stable across retries: deduplicate on it
 *   kind + level                   raised (level 1, the first message of a crossing) or repeated (a reminder / escalation)
 *   department                     HSM / RMD / LSM / RMS
 *   escalation: null               the mill has no contact list: nobody named
 */
import type { Alarm, AlertSeverity, EscalationLevel, MillEscalation } from '../../../contracts';
import type { LimitMill } from '../../../config/limits';
import { recipientsOf } from '../escalation';

export interface AlertEvent {
  id: string;
  kind: 'raised' | 'repeated';
  /** The raised event's id, on a repeat; null on the raise. */
  raisedId: string | null;
  /** When the sender decided to send it. */
  at: string;
  department: string;
  mill: LimitMill;
  asset: string;
  point: string;
  /** Asset and point, as the body says it ("Drive 03 · Flywheel · DE"). */
  equipment: string;
  ruleId: string;
  /** The alarm's stable key (mill|rule|asset|point). */
  alarmKey: string;
  severity: AlertSeverity;
  severityLabel: string;
  title: string;
  /** The Alerts page's one line. */
  message: string;
  value: number | null;
  unit: string;
  valueText: string;
  limit: number | null;
  limitLabel: string;
  limitText: string;
  /** Readings past the limit in this crossing. */
  readings: number;
  /** Crossings of this point in the checked window. */
  occurrences: number;
  since: string;
  sinceIst: string;
  timeIst: string;
  source: string;
  level: number;
  escalation: { level: number; of: number; everyMinutes: number; sms: EscalationLevel['sms']; whatsapp: EscalationLevel['whatsapp']; email: EscalationLevel['email'] } | null;
  smsTo: string[];
  whatsappTo: string[];
  emailTo: string[];
  subject: string;
  body: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IST_MS = 330 * 60_000;
const fmt = (v: number) => String(Math.round(v * 1000) / 1000);
const withUnit = (v: number, unit: string) => (!unit ? fmt(v) : unit.startsWith('%') ? `${fmt(v)}${unit}` : `${fmt(v)} ${unit}`);
const dayText = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

/** An instant as IST: "21 Nov 2026, 15:01 IST". */
export function istText(iso: string): string {
  const t = new Date(Date.parse(iso) + IST_MS).toISOString();
  return `${dayText(t.slice(0, 10))}, ${t.slice(11, 16)} IST`;
}

/** A reading's day and the time it was filled (already plant time): "19 Nov 2026, 14:05"; NA when unknown. */
export function sinceText(since: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](.+))?$/.exec(since.trim());
  if (!m) return since.trim() || 'NA';
  return m[2] ? `${dayText(m[1])}, ${m[2].trim()}` : dayText(m[1]);
}

/** The side the reading is on, and the edge it crossed. */
function sideOf(a: Alarm): { high: boolean; limit: number | null } {
  const l = a.limit;
  if (!l || a.value === null) return { high: true, limit: l?.max ?? l?.min ?? null };
  if (l.max !== null && a.value > l.max) return { high: true, limit: l.max };
  if (l.min !== null && a.value < l.min) return { high: false, limit: l.min };
  // Back near the limit (inside the deadband): the edge it is nearest.
  if (l.max !== null && l.min !== null) return Math.abs(a.value - l.max) <= Math.abs(a.value - l.min) ? { high: true, limit: l.max } : { high: false, limit: l.min };
  return l.max !== null ? { high: true, limit: l.max } : { high: false, limit: l.min };
}

/** One message: the alarm, as level `level` of the mill's contact list is told it. */
export function eventOf(a: Alarm, mill: LimitMill, esc: MillEscalation, level: number, kind: AlertEvent['kind'], id: string, raisedId: string | null, at: string): AlertEvent {
  const department = mill.toUpperCase();
  const lv = esc.levels[level - 1];
  const side = sideOf(a);
  const title = `${a.label} ${side.high ? 'high' : 'low'}`;
  const equipment = a.point ? `${a.asset} · ${a.point}` : a.asset;
  const severityLabel = a.severity.toUpperCase();
  const valueText = a.value === null ? 'NA' : withUnit(a.value, a.unit);
  const limitLabel = side.limit === null ? '' : side.high ? '> max' : '< min';
  const limitText = side.limit === null ? 'NA' : withUnit(side.limit, a.unit);
  const timeIst = istText(at);
  return {
    id, kind, raisedId, at, department, mill,
    asset: a.asset, point: a.point, equipment, ruleId: a.ruleId, alarmKey: a.key,
    severity: a.severity, severityLabel, title, message: a.message,
    value: a.value, unit: a.unit, valueText, limit: side.limit, limitLabel, limitText,
    readings: a.readings, occurrences: a.occurrences,
    since: a.since, sinceIst: sinceText(a.since), timeIst, source: a.source,
    level,
    escalation: lv ? { level, of: esc.levels.length, everyMinutes: lv.everyMinutes, sms: lv.sms, whatsapp: lv.whatsapp, email: lv.email } : null,
    ...recipientsOf(lv),
    subject: `[${severityLabel}] ${department} ${equipment} — ${title}`,
    body: [
      `Department: ${department}`,
      `Equipment: ${equipment || 'NA'}`,
      `Condition: ${title}`,
      `Severity: ${severityLabel}`,
      `Reading: ${valueText}`,
      `Limit: ${limitLabel ? `${limitLabel} ${limitText}` : 'NA'}`,
      `Time: ${timeIst}`,
    ].join('\n'),
  };
}
