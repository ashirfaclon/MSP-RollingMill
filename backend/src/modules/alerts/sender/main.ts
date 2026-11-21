/**
 * The alert sender (the user, 19 and 21 Nov 2026; SMS-ALERTS.md §6–§8): its own deployment, apart
 * from the API, so restarting the dashboard never stops alerting and a stuck receiver never takes the
 * dashboard down.
 *
 *   npm --prefix backend run alerts         (local, tsx)
 *   npm --prefix backend run alerts:prod    (built: node dist/alert-sender.js)
 *
 * Every ALERT_INTERVAL_SECONDS: run the one checker (millAlerts — the Alerts page's own function, so a
 * message and the row on screen can never disagree) for every mill, decide what is news (decide.ts),
 * write the memory to IOsense before delivering (state.ts), deliver (deliver.ts) to the n8n webhook(s),
 * which do the SMS / WhatsApp / email sending. Ticks never overlap.
 *
 * It reads the logbook with the account's access token (IOSENSE_BEARER / IOSENSE_PAT) and nobody ever
 * logs in to it, so a dashboard user's expired login can't silence it (SMS-ALERTS.md §9.1).
 *
 * Health: GET / on ALERT_PORT — 503 when no check has finished in three intervals.
 */
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { loadEnv } from '../../../config/env';
import { LIMIT_MILLS } from '../../../config/limits';
import { reseedSession } from '../../../integrations/logbook/client';
import { millAlerts } from '../alerts.service';
import { SHIPPED_ESCALATION } from '../escalation';
import { senderConfig } from './config';
import { decide, type MillRead } from './decide';
import { flush } from './deliver';
import { readState, recordSent, resume, writeState, ALIVE_MS, type OutboxEntry, type SenderState } from './state';
import { postJson, rehearsalUrls, urlLabel } from './webhook';

const cfg = senderConfig();
const commit = process.env.COMMIT_SHA?.slice(0, 7) ?? (() => {
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; }
})();
const log = (line: string) => console.log(`${new Date().toISOString()} ${line}`);

let state: SenderState | null = null;
let running = false;
const health = { lastTickAt: null as string | null, lastError: null as string | null, mills: {} as Record<string, string>, startedAt: Date.now() };

async function tick() {
  if (running) return;
  running = true;
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  try {
    const env = loadEnv();
    // The access token is never dropped for good: a refusal mid-way re-seeds it next tick.
    reseedSession();

    if (!state) {
      const read = await readState(env, cfg.stateForm, nowMs);
      if (!read.ok) throw new Error(`memory can't be read: ${read.message}`);
      const r = resume(read.state, nowMs);
      state = { ...r.state, commit };
      log(`memory: ${r.why}`);
    }

    const reads: MillRead[] = await Promise.all(LIMIT_MILLS.map(async (mill): Promise<MillRead> => {
      try {
        const rep = await millAlerts(env, mill, nowMs);
        const floors = new Map(rep.rules.map((r) => [r.ruleId, r.controls.minSeverityToNotify]));
        health.mills[mill] = rep.store.connection === 'up' ? 'ok' : `settings: ${rep.store.message}`;
        return { mill, ok: true, alarms: rep.alarms, escalation: rep.escalation, floorOf: (id) => floors.get(id) ?? rep.defaults.minSeverityToNotify };
      } catch (e) {
        health.mills[mill] = `can't be checked: ${e instanceof Error ? e.message : String(e)}`;
        return { mill, ok: false, alarms: [], escalation: SHIPPED_ESCALATION, floorOf: () => 'warning' };
      }
    }));

    const wasPrimed = state.primedAt !== null;
    const d = decide(state, reads, now);
    if (!wasPrimed) log(`primed: adopted ${d.open.length} standing condition(s) quietly`);

    const fresh = new Set<string>();
    const added: OutboxEntry[] = [];
    for (const e of d.events) {
      if (!cfg.urls.length) {
        log(`not sent (no ALERT_WEBHOOK_URL): ${e.subject}`);
        await recordSent(env, cfg.historyForm, e, { delivered: [], failed: [] });
        continue;
      }
      fresh.add(e.id);
      added.push({ event: e, owed: [...cfg.urls], tries: 0, lastTriedAt: null, lastError: null });
    }

    const before = JSON.stringify({ p: state.primedAt, o: state.open, b: state.outbox });
    state = { ...state, primedAt: d.primedAt, open: d.open, outbox: [...state.outbox, ...added], lastCheckAt: now };
    const changed = JSON.stringify({ p: state.primedAt, o: state.open, b: state.outbox }) !== before;
    // Written before anything is delivered, so a crash mid-way re-sends (the receiver dedups on id) rather than loses.
    if (changed || !state.savedAt || nowMs - Date.parse(state.savedAt) >= ALIVE_MS) await save(env, now);

    if (state.outbox.length) {
      const tests = rehearsalUrls(cfg.urls, cfg.testUrls, cfg.testCopies);
      const left = await flush(state.outbox, fresh, cfg.flushBudgetMs, {
        post: (url, body) => postJson(url, body, cfg.secret),
        rehearse: async (body) => {
          for (const u of tests) {
            const r = await postJson(u, body, cfg.secret, 5_000);
            if (!r.ok) log(`rehearsal copy not taken (${urlLabel(u)}: ${r.error}) — fine unless the n8n editor is listening`);
          }
        },
        done: async (e, outcome) => {
          const w = await recordSent(env, cfg.historyForm, e, outcome);
          if (!w.ok) log(`history not written for ${e.id}: ${w.message}`);
        },
        log,
        nowMs: () => Date.now(),
      });
      if (JSON.stringify(left) !== JSON.stringify(state.outbox)) {
        state = { ...state, outbox: left };
        await save(env, new Date().toISOString());
      }
    }

    health.lastTickAt = now;
    const failed = reads.filter((r) => !r.ok).map((r) => `${r.mill.toUpperCase()} ${health.mills[r.mill]}`);
    health.lastError = failed.length ? failed.join(' · ') : null;
    if (cfg.heartbeatUrl) {
      const r = await postJson(cfg.heartbeatUrl, { at: now, open: state.open.length, outbox: state.outbox.length }, cfg.secret, 5_000);
      if (!r.ok) log(`heartbeat not taken: ${r.error}`);
    }
  } catch (e) {
    health.lastError = e instanceof Error ? e.message : String(e);
    log(`check failed: ${health.lastError}`);
  } finally {
    running = false;
  }
}

async function save(env: ReturnType<typeof loadEnv>, at: string) {
  if (!state) return;
  const next = { ...state, savedAt: at };
  const w = await writeState(env, cfg.stateForm, next);
  if (w.ok) state = next;
  else log(`memory not saved: ${w.message} — kept here, tried again next check`);
}

function serveHealth() {
  const server = createServer((req, res) => {
    const late = Date.now() - (health.lastTickAt ? Date.parse(health.lastTickAt) : health.startedAt) > 3 * cfg.intervalMs;
    const body = {
      ok: !late && !health.lastError, commit, lastTickAt: health.lastTickAt, lastError: health.lastError,
      primedAt: state?.primedAt ?? null, open: state?.open.length ?? 0, outbox: state?.outbox.length ?? 0,
      receivers: cfg.urls.length, intervalSeconds: cfg.intervalMs / 1000, mills: health.mills,
      memory: cfg.stateForm, savedAt: state?.savedAt ?? null,
    };
    res.writeHead(late ? 503 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
    void req;
  });
  // A port already taken (locally, PORT in backend/.env is the API's) costs the health page, never the sending.
  server.on('error', (e) => log(`health page not served on :${cfg.port} — ${e.message}; set ALERT_PORT. Alerts are still checked and sent.`));
  server.listen(cfg.port, () => log(`health on :${cfg.port}`));
  return server;
}

function main() {
  const env = loadEnv();
  log(`rolling mill alert sender ${commit ?? ''} — every ${cfg.intervalMs / 1000}s — ${cfg.urls.length} receiver(s)${cfg.urls.length ? ` (${cfg.urls.map(urlLabel).join(', ')})` : ': none, alerts are tracked and nobody is told'}`
    + ` — memory ${cfg.stateForm}${env.iosenseBearer ? '' : ' — NO IOSENSE_BEARER: the logbook can\'t be read'}`);
  const server = serveHealth();
  void tick();
  const timer = setInterval(() => void tick(), cfg.intervalMs);
  const stop = (signal: string) => {
    log(`${signal}: stopping`);
    clearInterval(timer);
    server.close();
    // Let a tick in flight finish writing its memory.
    const wait = setInterval(() => { if (!running) { clearInterval(wait); process.exit(0); } }, 200);
    setTimeout(() => process.exit(0), 15_000).unref();
  };
  process.once('SIGTERM', () => stop('SIGTERM'));
  process.once('SIGINT', () => stop('SIGINT'));
}

main();
