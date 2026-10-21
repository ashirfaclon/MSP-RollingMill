/**
 * RMD chemical composition from the logbook's "Steel Melting Shop → SMS → CCM Lolipop Sample"
 * (sms/ccm-lolipop-sample), as the plant gave it: furnace number, CCM, %C (c-18), %Mn (mn-19),
 * %S (s-20), %P (p-21), %Si (si-22). One form serves every mill; its "mill" field picks the RMD
 * samples. An entry remarked "test" is left out. Read fresh from the logbook; submissions from a
 * month before the period, placed by the form's Date.
 */
import type { Env } from '../../config/env';
import type { RmdChemSample, RmdChemistryReport } from '../../contracts';
import { fetchFormEntries, num, type InsightEntry } from '../../integrations/logbook/client';
import { MSG } from '../../shared/messages';

export const CHEMISTRY_FORM = 'sms/ccm-lolipop-sample';
const LOOK_BACK_MS = 31 * 86_400_000;

/** An RMD sample, or null for another mill's, a test entry or one without a date. */
export function toSample(r: InsightEntry): (RmdChemSample & { submitted: string }) | null {
  const res = r.result ?? {};
  if (/\btest\b/i.test(String(res['remark'] ?? res['remarks'] ?? ''))) return null;
  if (String(res['mill'] ?? '').trim().toUpperCase() !== 'RMD') return null;
  const date = String(res['date'] ?? '').slice(0, 10);
  if (!date) return null;
  const text = (k: string) => String(res[k] ?? '').trim();
  return {
    date,
    time: text('ccm-time') || null,
    furnace: text('furnace-number'),
    ccm: text('ccm'),
    section: text('section'),
    c: num(res['c-18']),
    mn: num(res['mn-19']),
    s: num(res['s-20']),
    p: num(res['p-21']),
    si: num(res['si-22']),
    submitted: String(r.createdAt ?? ''),
  };
}

export async function rmdChemistry(env: Env, from: string, to: string): Promise<RmdChemistryReport> {
  const read = await fetchFormEntries(CHEMISTRY_FORM, Date.parse(`${from}T00:00:00+05:30`) - LOOK_BACK_MS, env);
  const samples = (read.ok ? read.rows.map(toSample).filter((s): s is NonNullable<typeof s> => s !== null) : [])
    .filter((s) => s.date >= from && s.date <= to)
    // Newest first: by the form's Date, then by when it was submitted.
    .sort((a, b) => (a.date !== b.date ? b.date.localeCompare(a.date) : b.submitted.localeCompare(a.submitted)))
    .map(({ submitted: _, ...s }) => s);
  return {
    from, to, form: CHEMISTRY_FORM,
    logbook: { connection: read.ok ? 'up' : 'down', message: read.ok ? MSG.LOGBOOK_UP : read.message },
    latest: samples[0] ?? null,
    samples,
  };
}
