/**
 * Delivering the outbox (docs/SETTINGS_AND_ALERTS_REPLICATION.md §8.5):
 *
 *   - Each message is owed to every receiver, tracked by URL; one receiver down retries only that one.
 *   - Retries back off 0, 1, 2, 4 … minutes, capped at 30, from the last try.
 *   - New messages go first every tick; retries get what is left of the flush budget, so a backlog can
 *     never stop the checking (the CPP build's 89 s flush on 3 Nov 2026).
 *   - A message still undelivered after GIVE_UP_MS is dropped and recorded as failed: by then it is old news.
 *   - The rehearsal copy (/webhook-test/) is posted with each first try and never decides anything.
 */
import type { AlertEvent } from './message';
import type { OutboxEntry } from './state';
import type { PostResult } from './webhook';

const CAP_MS = 30 * 60_000;
export const GIVE_UP_MS = 24 * 3_600_000;

/** When an entry may be tried again. */
export function nextTryAt(e: OutboxEntry): number {
  if (!e.lastTriedAt || e.tries === 0) return 0;
  const wait = Math.min(CAP_MS, 60_000 * 2 ** (e.tries - 1));
  return Date.parse(e.lastTriedAt) + wait;
}

export interface FlushDeps {
  post: (url: string, body: AlertEvent) => Promise<PostResult>;
  rehearse: (body: AlertEvent) => Promise<void>;
  /** A message done with: delivered to every receiver, or given up on. */
  done: (e: AlertEvent, outcome: { delivered: string[]; failed: string[] }) => Promise<void>;
  log: (line: string) => void;
  nowMs: () => number;
}

/** Try what is owed; returns the outbox still owed. `fresh` = ids accepted this tick (tried first, outside the budget). */
export async function flush(outbox: OutboxEntry[], fresh: Set<string>, budgetMs: number, deps: FlushDeps): Promise<OutboxEntry[]> {
  const start = deps.nowMs();
  const order = [...outbox.filter((e) => fresh.has(e.event.id)), ...outbox.filter((e) => !fresh.has(e.event.id))];
  const keep: OutboxEntry[] = [];
  for (const e of order) {
    const now = deps.nowMs();
    const isNew = fresh.has(e.event.id);
    if (!isNew && Date.parse(e.event.at) + GIVE_UP_MS < now) {
      deps.log(`gave up: ${e.event.subject} — undelivered for a day (${e.lastError ?? 'no reason'})`);
      await deps.done(e.event, { delivered: [], failed: e.owed });
      continue;
    }
    // The budget is spent (0: every retry waits for the next tick).
    if (!isNew && (now < nextTryAt(e) || now - start >= budgetMs)) { keep.push(e); continue; }
    if (e.tries === 0) await deps.rehearse(e.event);
    const owed: string[] = [];
    let lastError: string | null = null;
    for (const url of e.owed) {
      const r = await deps.post(url, e.event);
      if (!r.ok) { owed.push(url); lastError = r.error; }
    }
    const next: OutboxEntry = { ...e, owed, tries: e.tries + 1, lastTriedAt: new Date(deps.nowMs()).toISOString(), lastError };
    if (owed.length) {
      deps.log(`not delivered (try ${next.tries}): ${e.event.subject} — ${lastError}`);
      keep.push(next);
      continue;
    }
    deps.log(`sent: ${e.event.subject} → level ${e.event.level}: sms ${e.event.smsTo.length}, whatsapp ${e.event.whatsappTo.length}, email ${e.event.emailTo.length}`);
    await deps.done(e.event, { delivered: e.owed, failed: [] });
  }
  return keep;
}
