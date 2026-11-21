/**
 * Who is told, and how often — each mill's escalation matrix (the user, 21 Nov 2026: one contact list
 * per mill, as SMS-ALERTS.md §5.5 has it for the Melt Shop). Stored in the settings document beside the
 * mill's alert controls (alerts → mill → escalation) and saved whole: the screen sends the list as it
 * stands, never a patch.
 *
 *   onePerCrossing  on (shipped): each crossing is told once, to level 1 only
 *                   off: every level on its own interval while the crossing stands (sender/decide.ts)
 *   levels          up to 10; each with every-N-minutes and SMS / WhatsApp / email, each switchable
 *
 * Checking (§5.5): phones lose spaces, dashes and brackets and must be 7–15 digits (a leading + kept);
 * emails are lower-cased; duplicates dropped; a channel switched on with nobody on it is refused, one
 * switched off keeps its contacts. Read leniently: a stored level that is not valid is dropped.
 */
import type { AlertChannel, EscalationLevel, MillEscalation } from '../../contracts';

export const MAX_LEVELS = 10;
/** A week. */
export const MAX_EVERY_MINUTES = 10_080;
export const SHIPPED_ESCALATION: MillEscalation = { onePerCrossing: true, levels: [], setBy: null, setAt: null };

const CHANNELS = ['sms', 'whatsapp', 'email'] as const;
type ChannelId = typeof CHANNELS[number];
const CHANNEL_LABEL: Record<ChannelId, string> = { sms: 'SMS', whatsapp: 'WhatsApp', email: 'Email' };

const objectOf = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});

/** "+91 98765-43210", "(0771) 123 4567" → "+919876543210", "07711234567"; null when not a phone number. */
export function phoneOf(raw: string): string | null {
  const t = raw.trim().replace(/[\s\-().]/g, '');
  return /^\+?\d{7,15}$/.test(t) ? t : null;
}

/** Lower-cased; null when not an email id. */
export function emailOf(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(t) ? t : null;
}

/** A contact list typed as one string ("a, b; c") or sent as a list. */
const listOf = (v: unknown): string[] =>
  (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(/[,;\n]/) : []).map((s) => s.trim()).filter(Boolean);

/** One channel checked: its contacts normalised, every bad one named. */
function channelOf(raw: unknown, id: ChannelId, where: string, problems: string[]): AlertChannel {
  const r = objectOf(raw);
  const norm = id === 'email' ? emailOf : phoneOf;
  const contacts: string[] = [];
  for (const c of listOf(r.contacts)) {
    const n = norm(c);
    if (!n) { problems.push(`${where} ${CHANNEL_LABEL[id]}: "${c}" is not ${id === 'email' ? 'an email id' : 'a phone number (7 to 15 digits)'}`); continue; }
    if (!contacts.includes(n)) contacts.push(n);
  }
  const enabled = r.enabled === true;
  if (enabled && !contacts.length) problems.push(`${where} ${CHANNEL_LABEL[id]} is on with nobody on it — add a ${id === 'email' ? 'email id' : 'number'} or switch it off`);
  return { enabled, contacts };
}

/** The list sent by the screen, checked whole: the matrix to save, and every problem in words. */
export function checkEscalation(raw: unknown): { value: Pick<MillEscalation, 'onePerCrossing' | 'levels'>; problems: string[] } {
  const r = objectOf(raw);
  const problems: string[] = [];
  if (typeof r.onePerCrossing !== 'boolean') problems.push('One message per crossing must be on or off');
  const rawLevels = Array.isArray(r.levels) ? r.levels : [];
  if (!Array.isArray(r.levels)) problems.push('The levels must be a list');
  if (rawLevels.length > MAX_LEVELS) problems.push(`At most ${MAX_LEVELS} levels`);
  const levels = rawLevels.slice(0, MAX_LEVELS).map((lv, i): EscalationLevel => {
    const l = objectOf(lv);
    const where = `Level ${i + 1}`;
    const every = l.everyMinutes;
    if (typeof every !== 'number' || !Number.isInteger(every) || every < 0 || every > MAX_EVERY_MINUTES) {
      problems.push(`${where}: every must be whole minutes from 0 (once) to ${MAX_EVERY_MINUTES} (a week)`);
    }
    return {
      everyMinutes: typeof every === 'number' && Number.isFinite(every) ? every : 0,
      sms: channelOf(l.sms, 'sms', where, problems),
      whatsapp: channelOf(l.whatsapp, 'whatsapp', where, problems),
      email: channelOf(l.email, 'email', where, problems),
    };
  });
  return { value: { onePerCrossing: r.onePerCrossing !== false, levels }, problems };
}

/** The mill's stored matrix, read leniently: a level that does not check out is dropped, not guessed. */
export function escalationOf(stored: unknown): MillEscalation {
  const r = objectOf(stored);
  if (!Object.keys(r).length) return { ...SHIPPED_ESCALATION };
  const levels = (Array.isArray(r.levels) ? r.levels : []).flatMap((lv) => {
    const c = checkEscalation({ onePerCrossing: true, levels: [lv] });
    return c.problems.length ? [] : c.value.levels;
  });
  return {
    onePerCrossing: r.onePerCrossing !== false,
    levels,
    setBy: typeof r.by === 'string' ? r.by : null,
    setAt: typeof r.at === 'string' ? r.at : null,
  };
}

/** What a level tells: the contacts of its switched-on channels (switched-off ones emptied). */
export function recipientsOf(level: EscalationLevel | undefined) {
  const on = (c: AlertChannel | undefined) => (c?.enabled ? [...c.contacts] : []);
  return { smsTo: on(level?.sms), whatsappTo: on(level?.whatsapp), emailTo: on(level?.email) };
}
