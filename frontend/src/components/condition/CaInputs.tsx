'use client';

/**
 * The Condition Analytics inputs popup: one month's targets and costs for a mill (caConfig.ts), from
 * the "Edit inputs" button on Costing & impact. Opens on the month as last saved; Save writes one entry
 * to the mill's logbook form (CA Inputs, every field a column) — the latest entry of a month wins.
 */
import { useEffect, useState } from 'react';
import DrillDrawer from '@/components/drill/DrillDrawer';
import { postJson, useApi, type FormSaveResult, type SavedCaInputs } from '@/services/hsmApi';
import { caFieldsFor, type CaGroup, type CaMill } from './caConfig';
import '@/components/checklist/checklist.css';

const thisMonth = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7);
const r2 = (v: number) => String(Math.round(v * 100) / 100);

export default function CaInputs({ mill, open, onClose }: { mill: CaMill; open: boolean; onClose: () => void }) {
  const fields = caFieldsFor(mill);
  const [month, setMonth] = useState(thisMonth);
  const [values, setValues] = useState<Record<string, string>>({});
  const groups: CaGroup[] = ['Targets', 'Costs'];
  const url = open ? `/api/forms/ca/${mill}?month=${month}` : null;
  const s = useApi<SavedCaInputs>(url);
  const saved = s.data && s.dataUrl === url ? s.data : null;
  /** The month the fields were filled for: refreshes never overwrite what is being typed. */
  const [filledFor, setFilledFor] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: 'saving' | 'saved' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (filledFor === month || (!saved && !s.error)) return;
    setValues(Object.fromEntries(fields.map((f) => [f.key, saved?.values[f.key] == null ? '' : r2(saved.values[f.key]!)])));
    setFilledFor(month);
    setStatus(null);
  }, [saved, s.error, month, filledFor, fields]);

  const save = async () => {
    const missing = fields.filter((f) => !Number.isFinite(Number(values[f.key])) || (values[f.key] ?? '').trim() === '');
    if (missing.length) { setStatus({ kind: 'error', text: `Fill every field — ${missing.length} empty.` }); return; }
    setStatus({ kind: 'saving', text: 'Saving…' });
    try {
      await postJson<FormSaveResult>(`/api/forms/ca/${mill}`, { month, values: Object.fromEntries(fields.map((f) => [f.key, Number(values[f.key])])) });
      setStatus({ kind: 'saved', text: 'Saved to the logbook (CA Inputs).' });
    } catch (e) {
      setStatus({ kind: 'error', text: (e as Error).message });
    }
  };

  return (
    <DrillDrawer open={open} onClose={onClose} title={`${mill.toUpperCase()} · CA inputs`} sub="Targets and costs, one month at a time"
      loading={!!url && !s.data && !s.error} error={s.error} hasData>
      <div className="ck-form">
        <div className="ck-grid ck-grid--wide">
          <label className="ck-f"><span>Month</span>
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          </label>
        </div>
        {groups.map((g) => (
          <section className="ck-group" key={g} aria-label={g}>
            <div className="ck-group-head"><h3 className="rm-k">{g}</h3></div>
            <div className="ck-grid ck-grid--wide">
              {fields.filter((f) => f.group === g).map((f) => (
                <label className="ck-f" key={f.key} title={`Used for: ${f.feeds}`}>
                  <span>{f.label}</span>
                  <input type="number" min={0} step="0.01" inputMode="decimal" value={values[f.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
                </label>
              ))}
            </div>
          </section>
        ))}
        <div className="ck-actions">
          <button type="button" className="ck-save" onClick={save} disabled={status?.kind === 'saving'}>Save inputs</button>
          {status
            ? <span role="status" className={status.kind === 'error' ? 'ck-msg-error' : undefined}>{status.text}</span>
            : <span>{saved?.saved ? 'Opened on the inputs as last saved.' : 'Not saved for this month yet.'}</span>}
        </div>
      </div>
    </DrillDrawer>
  );
}
