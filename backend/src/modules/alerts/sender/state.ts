/**
 * The sender's memory, kept in IOsense rather than on the server's disk (the user, 19 Nov 2026: a
 * redeploy wipes the server — docs/SMS-ALERTS.md §9.2 is that gap in the Melt Shop's build):
 *
 *   state    one row of the logbook insight (ALERT_STATE_FORM), updated in place: when it first looked
 *            (primedAt), the crossings it remembers and what it told, and the messages not yet delivered
 *            (the outbox). Written before anything is delivered, whenever it changes, and at least every
 *            ALIVE_MS — so the Alerts page can say whether the sender is running.
 *   history  one row per message delivered (ALERT_HISTORY_FORM): the alert history.
 *
 * Memory older than MAX_GAP_MS (the sender was stopped for hours) is not trusted: it looks afresh,
 * quietly, rather than send crossings that are hours old. Undelivered messages are kept either way.
 * Run ONE sender per store: two would each send every message.
 */
import type { Env } from '../../../config/env';
import { appendFormEntry, fetchFormEntries, saveFormEntries, type InsightEntry } from '../../../integrations/logbook/client';
import type { OpenAlert } from './decide';
import type { AlertEvent } from './message';

/** A healthy sender writes at least this often. */
export const ALIVE_MS = 30 * 60_000;
/** Memory older than this is not trusted. */
export const MAX_GAP_MS = 6 * 3_600_000;
/** The memory is looked for this far back. */
const LOOK_BACK_MS = 30 * 86_400_000;
export const SENDER_ID = 'alert-sender';

/** A message accepted and not yet delivered to every receiver. */
export interface OutboxEntry {
  event: AlertEvent;
  /** Receivers still owed it (by URL, so reordering the list can't misroute it). */
  owed: string[];
  tries: number;
  lastTriedAt: string | null;
  lastError: string | null;
}

export interface SenderState {
  version: 1;
  primedAt: string | null;
  /** The last good check. */
  lastCheckAt: string | null;
  savedAt: string | null;
  commit: string | null;
  open: OpenAlert[];
  outbox: OutboxEntry[];
}

export const emptyState = (): SenderState => ({ version: 1, primedAt: null, lastCheckAt: null, savedAt: null, commit: null, open: [], outbox: [] });

const objectOf = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const arr = (v: unknown) => (Array.isArray(v) ? v : []);

/** A stored row → the state; anything not valid is dropped (the connector also drops empty lists). */
export function coerceState(raw: unknown): SenderState | null {
  const r = objectOf(raw);
  if (r.version !== 1) return null;
  const open = arr(r.open).map(objectOf).filter((o) => str(o.key) && str(o.episode) && str(o.mill)).map((o): OpenAlert => ({
    key: String(o.key), episode: String(o.episode), mill: o.mill as OpenAlert['mill'], seenAt: str(o.seenAt) ?? new Date(0).toISOString(),
    silent: o.silent === 'primed' || o.silent === 'muted' || o.silent === 'below' ? o.silent : null,
    told: arr(o.told).map(objectOf).filter((t) => typeof t.level === 'number' && str(t.at)).map((t) => ({ level: Number(t.level), at: String(t.at) })),
  }));
  const outbox = arr(r.outbox).map(objectOf).filter((e) => str(objectOf(e.event).id)).map((e): OutboxEntry => ({
    event: e.event as AlertEvent, owed: arr(e.owed).filter((u): u is string => typeof u === 'string'),
    tries: typeof e.tries === 'number' ? e.tries : 0, lastTriedAt: str(e.lastTriedAt), lastError: str(e.lastError),
  }));
  return { version: 1, primedAt: str(r.primedAt), lastCheckAt: str(r.lastCheckAt), savedAt: str(r.savedAt), commit: str(r.commit), open, outbox };
}

const rowAt = (x: InsightEntry) => String(x.updatedAt ?? x.createdAt ?? x.invocationTime ?? '');

/** The newest stored state; null when there is none. */
export function newestState(rows: InsightEntry[]): SenderState | null {
  for (const row of [...rows].sort((a, b) => rowAt(b).localeCompare(rowAt(a)))) {
    const s = coerceState(row.result);
    if (s) return s;
  }
  return null;
}

const tagOf = (form: string) => form.replace('__', '/');

/** The stored memory: none yet is a fresh start; a read that fails is said, never guessed past. */
export async function readState(env: Env, form: string, nowMs = Date.now()): Promise<{ ok: true; state: SenderState | null } | { ok: false; message: string }> {
  const read = await fetchFormEntries(tagOf(form), nowMs - LOOK_BACK_MS, env, nowMs);
  if (!read.ok) return { ok: false, message: read.message };
  return { ok: true, state: newestState(read.rows) };
}

/** The memory to start from: the stored one, looked at afresh when it is too old to trust. */
export function resume(stored: SenderState | null, nowMs: number): { state: SenderState; why: string } {
  if (!stored) return { state: emptyState(), why: 'no memory yet — first look is quiet' };
  const age = stored.savedAt ? nowMs - Date.parse(stored.savedAt) : Infinity;
  if (!(age <= MAX_GAP_MS)) {
    return { state: { ...emptyState(), outbox: stored.outbox }, why: `memory last saved ${stored.savedAt ?? 'never'} — too old to trust, looking afresh (quietly); ${stored.outbox.length} undelivered kept` };
  }
  return { state: stored, why: `memory from ${stored.savedAt}: ${stored.open.length} crossing(s), ${stored.outbox.length} undelivered` };
}

/** Write the memory (one row, updated in place). */
export async function writeState(env: Env, form: string, state: SenderState): Promise<{ ok: true } | { ok: false; message: string }> {
  const w = await saveFormEntries(form, [state as unknown as Record<string, unknown>], () => 'state', SENDER_ID, env);
  return w.ok ? { ok: true } : { ok: false, message: w.message };
}

/** One row of history for a message delivered (or given up on). */
export async function recordSent(env: Env, form: string, e: AlertEvent, outcome: { delivered: string[]; failed: string[] }) {
  const result = {
    id: e.id, kind: e.kind, at: e.at, department: e.department, mill: e.mill, equipment: e.equipment, ruleId: e.ruleId,
    severity: e.severity, title: e.title, valueText: e.valueText, limitText: e.limitText, level: e.level,
    smsTo: e.smsTo, whatsappTo: e.whatsappTo, emailTo: e.emailTo, subject: e.subject, body: e.body,
    delivered: outcome.delivered.length, failed: outcome.failed.length,
  };
  return appendFormEntry(form, result, SENDER_ID, env);
}
