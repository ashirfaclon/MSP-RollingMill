/**
 * The alert sender's settings, from its environment (docs/SMS-ALERTS.md §8.2). Read on every call, like
 * config/env.ts, so tests can set and clear them per case.
 *
 *   ALERT_WEBHOOK_URL       receivers: a list (commas, spaces or newlines). Empty: alerts are tracked, nobody told
 *   ALERT_WEBHOOK_SECRET    sent as X-Alert-Token (check it in the n8n workflow)
 *   ALERT_WEBHOOK_TEST      "off" stops the rehearsal copy to an n8n URL's /webhook-test/ sibling
 *   ALERT_WEBHOOK_TEST_URL  explicit rehearsal URLs instead of the siblings
 *   ALERT_INTERVAL_SECONDS  the tick, default 60, at least 15
 *   ALERT_PORT              the health server's port; else the platform's PORT (the port its web address is
 *                           forwarded to — a 502 there on 21 Nov 2026 was the sender on 5151); else 5151
 *   ALERT_HEARTBEAT_URL     POSTed after every good tick, so something outside notices a silent sender
 *   ALERT_FLUSH_BUDGET_MS   time each tick may spend on retries, default 20 000
 *   ALERT_STATE_FORM        the sender's memory in the logbook insight, default rolling-mill-alerts__sender
 *   ALERT_HISTORY_FORM      one row per message sent, default rolling-mill-alerts__sent
 *
 * A local rehearsal points the two forms at test names, so it never shares memory with the real sender.
 */
const opt = (name: string) => {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : null;
};
const listOf = (v: string | null) => (v ?? '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
const intOf = (v: string | null, dflt: number) => {
  const n = Number(v);
  return v !== null && Number.isFinite(n) ? Math.round(n) : dflt;
};

export const DEFAULT_STATE_FORM = 'rolling-mill-alerts__sender';
export const DEFAULT_HISTORY_FORM = 'rolling-mill-alerts__sent';

export interface SenderConfig {
  urls: string[];
  secret: string | null;
  testCopies: boolean;
  testUrls: string[];
  intervalMs: number;
  port: number;
  heartbeatUrl: string | null;
  flushBudgetMs: number;
  stateForm: string;
  historyForm: string;
}

export function senderConfig(): SenderConfig {
  return {
    urls: listOf(opt('ALERT_WEBHOOK_URL')),
    secret: opt('ALERT_WEBHOOK_SECRET'),
    testCopies: (opt('ALERT_WEBHOOK_TEST') ?? 'on').toLowerCase() !== 'off',
    testUrls: listOf(opt('ALERT_WEBHOOK_TEST_URL')),
    intervalMs: Math.max(15, intOf(opt('ALERT_INTERVAL_SECONDS'), 60)) * 1000,
    port: intOf(opt('ALERT_PORT') ?? opt('PORT'), 5151),
    heartbeatUrl: opt('ALERT_HEARTBEAT_URL'),
    flushBudgetMs: Math.max(0, intOf(opt('ALERT_FLUSH_BUDGET_MS'), 20_000)),
    stateForm: opt('ALERT_STATE_FORM') ?? DEFAULT_STATE_FORM,
    historyForm: opt('ALERT_HISTORY_FORM') ?? DEFAULT_HISTORY_FORM,
  };
}
