/**
 * Whether the alert sender is running, as the Alerts page and the Settings screen say it: read from
 * the memory it keeps in IOsense (state.ts), which a running sender writes at least every ALIVE_MS.
 * The sender is its own deployment, so this is the only way the API can know. Read at most every 120 s.
 */
import type { Env } from '../../../config/env';
import type { AlertsReport } from '../../../contracts';
import { sharedFresh } from '../../../shared/shared-fresh';
import { senderConfig } from './config';
import { ALIVE_MS, readState } from './state';
import { istText } from './message';

const FRESH_MS = 120_000;
/** Two missed writes and a margin. */
const LATE_MS = 2 * ALIVE_MS + 15 * 60_000;

export async function senderStatus(env: Env, nowMs = Date.now()): Promise<AlertsReport['sender']> {
  const form = senderConfig().stateForm;
  try {
    const read = await sharedFresh(`sender-status:${form}`, FRESH_MS, () => readState(env, form, nowMs), nowMs);
    if (!read.ok) return { running: false, lastCheckAt: null, message: `Can't tell whether the alert sender is running — ${read.message}.` };
    const s = read.state;
    if (!s?.lastCheckAt) return { running: false, lastCheckAt: null, message: 'The alert sender is not running yet, so no messages are sent. This page shows what it will send.' };
    if (nowMs - Date.parse(s.lastCheckAt) > LATE_MS) {
      return { running: false, lastCheckAt: s.lastCheckAt, message: `The alert sender has not checked since ${istText(s.lastCheckAt)} — no messages are going out.` };
    }
    return { running: true, lastCheckAt: s.lastCheckAt, message: `Messages are being sent for these alerts (the alert sender last checked ${istText(s.lastCheckAt)}).` };
  } catch (e) {
    return { running: false, lastCheckAt: null, message: `Can't tell whether the alert sender is running — ${e instanceof Error ? e.message : String(e)}.` };
  }
}
