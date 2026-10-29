/**
 * Condition Analytics inputs in their logbook form (CA Inputs Form Spec): one entry per month with
 * every field of the dashboard's popup; the latest entry of a month wins.
 */
import type { Env } from '../../config/env';
import type { CaInputsBody, SavedCaInputs } from '../../contracts';
import { saveFormEntries, fetchFormEntries, num, type FormWrite } from '../../integrations/logbook/client';
import { HttpError } from '../../shared/http-error';
import { CA_FORM, CA_KEYS, tagOf, type CaKey, type ConfigMill } from './forms';

const LOOK_BACK_MS = 400 * 86_400_000;
const mmYyyy = (month: string) => `${month.slice(5, 7)}-${month.slice(0, 4)}`;
const KEYS = Object.keys(CA_KEYS) as CaKey[];

export function caEntry(body: CaInputsBody): Record<string, unknown> {
  if (!/^\d{4}-\d{2}$/.test(String(body?.month))) throw new HttpError(400, 'bad_month', 'month must be YYYY-MM');
  const entry: Record<string, unknown> = { month: mmYyyy(body.month) };
  for (const k of KEYS) {
    const v = body.values?.[k];
    // Every field is required in the form.
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new HttpError(400, 'bad_value', `${k} must be a number ≥ 0`);
    entry[CA_KEYS[k]] = v;
  }
  return entry;
}

export function saveCaInputs(env: Env, mill: ConfigMill, body: CaInputsBody, filledBy: string): Promise<FormWrite> {
  // One row per month: a month saved before is updated, not added again.
  return saveFormEntries(CA_FORM[mill], [caEntry(body)], (r) => String(r.month ?? ''), filledBy, env);
}

export async function savedCaInputs(env: Env, mill: ConfigMill, month: string): Promise<SavedCaInputs> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, 'bad_month', 'month must be YYYY-MM');
  const empty: SavedCaInputs = { month, saved: false, values: Object.fromEntries(KEYS.map((k) => [k, null])), savedAt: null };
  const read = await fetchFormEntries(tagOf(CA_FORM[mill]), Date.parse(`${month}-01T00:00:00+05:30`) - LOOK_BACK_MS, env);
  if (!read.ok) return empty;
  const mine = read.rows
    .filter((r) => String(r.result?.month ?? '') === mmYyyy(month))
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  const last = mine[0];
  if (!last) return empty;
  return {
    month, saved: true,
    values: Object.fromEntries(KEYS.map((k) => [k, num(last.result?.[CA_KEYS[k]])])),
    savedAt: String(last.createdAt ?? '') || null,
  };
}
