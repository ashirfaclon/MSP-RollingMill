'use client';

/**
 * Equipment settings in a drill-down (the user, 31 Oct 2026): the values a KPI is worked out with —
 * HSM motor rated current, RMD oil tank size — shown as a table, with Edit to change them. Save writes
 * only what changed; the backend keeps the edit (who and when) and every screen reloads with it.
 * A value differing from its default says so.
 */
import { useState } from 'react';
import { fixed } from '@/lib/num';
import { dm } from '@/lib/plantDay';
import { postJson, type FormSaveResult } from '@/services/hsmApi';
import '@/components/plan/plan.css';
import '@/components/checklist/checklist.css';

export interface SettingCol { key: string; label: string; dp: number; step: string }
export interface SettingRow {
  id: string; label: string;
  values: Record<string, number>; defaults: Record<string, number>;
  edited: boolean; editedAt: string | null; editedBy: string | null;
  /** A figure worked out from the values (e.g. capacity, L), shown after them. */
  derived?: (v: Record<string, number>) => string;
}

export default function EquipmentSettings({ title, cols, derivedLabel, rows, saveUrl, toBody }: {
  title: string; cols: SettingCol[]; derivedLabel?: string; rows: SettingRow[]; saveUrl: string;
  /** The save body from the rows that changed. */
  toBody: (changed: { id: string; values: Record<string, number> }[]) => unknown;
}) {
  const [draft, setDraft] = useState<Record<string, Record<string, string>> | null>(null);
  const [status, setStatus] = useState<{ kind: 'saving' | 'saved' | 'error'; text: string } | null>(null);
  const editing = draft !== null;

  const start = () => {
    setDraft(Object.fromEntries(rows.map((r) => [r.id, Object.fromEntries(cols.map((c) => [c.key, String(r.values[c.key])]))])));
    setStatus(null);
  };
  const valueOf = (r: SettingRow) => (editing
    ? Object.fromEntries(cols.map((c) => [c.key, Number(draft![r.id][c.key])]))
    : r.values);
  const save = async () => {
    if (!draft) return;
    const bad = rows.find((r) => cols.some((c) => !Number.isFinite(Number(draft[r.id][c.key])) || draft[r.id][c.key].trim() === ''));
    if (bad) { setStatus({ kind: 'error', text: `${bad.label}: enter a number in every box.` }); return; }
    const changed = rows.map((r) => ({ id: r.id, values: valueOf(r) }))
      .filter((x) => cols.some((c) => x.values[c.key] !== rows.find((r) => r.id === x.id)!.values[c.key]));
    if (!changed.length) { setDraft(null); return; }
    setStatus({ kind: 'saving', text: 'Saving…' });
    try {
      const r = await postJson<FormSaveResult>(saveUrl, toBody(changed));
      setStatus({ kind: 'saved', text: `Saved — ${r.entries} changed. Every screen now uses the new value${r.entries === 1 ? '' : 's'}.` });
      setDraft(null);
    } catch (e) {
      setStatus({ kind: 'error', text: (e as Error).message });
    }
  };

  return (
    <section className="eq-settings" aria-label={title}>
      <div className="eq-head">
        <span className="rm-k">{title}</span>
        {editing ? (
          <span className="eq-actions">
            <button type="button" className="ck-save" onClick={save} disabled={status?.kind === 'saving'}>Save</button>
            <button type="button" className="pc-btn" onClick={() => { setDraft(null); setStatus(null); }}>Cancel</button>
          </span>
        ) : (
          <button type="button" className="rm-plan-edit" onClick={start}>Edit</button>
        )}
      </div>
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label={title}>
          <thead><tr>
            <th />{cols.map((c) => <th key={c.key} className="r">{c.label}</th>)}{derivedLabel && <th className="r">{derivedLabel}</th>}<th>Changed</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><b>{r.label}</b></td>
                {cols.map((c) => (
                  <td key={c.key} className="num r">
                    {editing ? (
                      <input className="pc-in eq-in" type="number" min={0} step={c.step} inputMode="decimal" value={draft![r.id][c.key]}
                        aria-label={`${r.label} ${c.label}`} onChange={(e) => setDraft((d) => ({ ...d!, [r.id]: { ...d![r.id], [c.key]: e.target.value } }))} />
                    ) : fixed(r.values[c.key], c.dp)}
                  </td>
                ))}
                {derivedLabel && <td className="num r">{r.derived ? r.derived(valueOf(r)) : '—'}</td>}
                <td className="eq-changed">
                  {r.edited
                    ? <>{r.editedAt ? dm(r.editedAt.slice(0, 10)) : 'Edited'}{r.editedBy ? ` · ${r.editedBy}` : ''} <span className="eq-default">default {cols.map((c) => fixed(r.defaults[c.key], c.dp)).join(' × ')}</span></>
                    : <span className="eq-default">default</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {status && <p role="status" className={status.kind === 'error' ? 'ck-msg-error' : 'eq-status'}>{status.text}</p>}
    </section>
  );
}
