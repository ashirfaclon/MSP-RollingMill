'use client';

/**
 * HSM · Shift setup checklist — the plant's "Checklist" sheet (Rolling_Mill_Checklists_Data.xlsx)
 * as a form, field for field: who is on shift, RM / FM guide settings, vertical edger and pinch
 * roll gaps, roll type (R1–R5) and work roll diameter (R1–R5, F1–F6). Everything is typed. Save
 * writes one entry to the logbook form (HSM Checklists → Shift Setup Checklist); the values are kept
 * under the form's own column names.
 */
import { useState, type ReactNode } from 'react';
import DrillDrawer from '@/components/drill/DrillDrawer';
import { useSelection } from '@/services/hsmProduction';
import { postJson, type FormSaveResult } from '@/services/hsmApi';
import './checklist.css';

const R = ['R1', 'R2', 'R3', 'R4', 'R5'];
const F = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'];
type Values = Record<string, string>;

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="ck-group">
      <div className="ck-group-head"><h3 className="rm-k">{title}</h3></div>
      <div className="ck-grid">{children}</div>
    </div>
  );
}

export default function SetupChecklist({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { today } = useSelection();
  const [v, setV] = useState<Values>({ Shift: 'Day' });
  const [status, setStatus] = useState<{ kind: 'saving' | 'saved' | 'error'; text: string } | null>(null);
  const date = v.Date || today || '';
  const set = (k: string, x: string) => { setV((s) => ({ ...s, [k]: x })); setStatus(null); };
  /** A number field: `k` is the form's column, `label` what the screen shows. */
  // Called as a function, not <Num/>: a component made inside render would remount and drop focus.
  const Num = ({ k, label, step = '1' }: { k: string; label: string; step?: string }) => (
    <label className="ck-f" key={k}><span>{label}</span>
      <input type="number" step={step} inputMode="decimal" value={v[k] ?? ''} onChange={(e) => set(k, e.target.value)} />
    </label>
  );

  const save = async () => {
    const values: Record<string, string | number | null> = { Date: date };
    for (const [k, x] of Object.entries(v)) {
      if (k === 'Date') continue;
      const t = x.trim();
      const text = ['Shift', 'Shift in-charge', 'Employee ID', 'Remark'].includes(k) || k.startsWith('Roll type');
      values[k] = t === '' ? null : text ? t : Number(t);
    }
    setStatus({ kind: 'saving', text: 'Saving…' });
    try {
      await postJson<FormSaveResult>('/api/forms/hsm/setup', { values });
      setStatus({ kind: 'saved', text: 'Saved to the logbook (Shift Setup Checklist).' });
    } catch (e) {
      setStatus({ kind: 'error', text: (e as Error).message });
    }
  };

  return (
    <DrillDrawer open={open} onClose={onClose} title="Shift setup checklist" sub="HSM · mill settings" loading={false} error={null} hasData>
      <form className="ck-form" onSubmit={(e) => { e.preventDefault(); void save(); }} aria-label="Shift setup checklist">
        <div className="ck-group">
          <div className="ck-grid ck-grid--wide">
            <label className="ck-f"><span>Date</span>
              <input type="date" value={date} max={today ?? undefined} onChange={(e) => set('Date', e.target.value)} />
            </label>
            <label className="ck-f"><span>Shift</span>
              <select value={v.Shift ?? 'Day'} onChange={(e) => set('Shift', e.target.value)}><option>Day</option><option>Night</option></select>
            </label>
            <label className="ck-f"><span>Shift in-charge</span><input type="text" value={v['Shift in-charge'] ?? ''} onChange={(e) => set('Shift in-charge', e.target.value)} /></label>
            <label className="ck-f"><span>Employee ID</span><input type="text" value={v['Employee ID'] ?? ''} onChange={(e) => set('Employee ID', e.target.value)} /></label>
            {Num({ k: 'Manpower availability', label: 'Manpower availability' })}
          </div>
        </div>

        <Group title="RM guide setting">{R.map((s) => Num({ k: `RM guide setting ${s}`, label: s }))}</Group>
        <Group title="FM guide setting">{F.map((s) => Num({ k: `FM guide setting ${s}`, label: s }))}</Group>
        <Group title="Vertical edger gap · pinch roll gap">
          {Num({ k: 'Vertical edger gap V1', label: 'V1' })}
          {Num({ k: 'Vertical edger gap V2', label: 'V2' })}
          {Num({ k: 'Vertical pinch roll gap', label: 'Vertical pinch roll gap', step: '0.01' })}
        </Group>
        <Group title="Roll type">
          {R.map((s) => (
            <label className="ck-f" key={s}><span>{s}</span>
              <select value={v[`Roll type ${s}`] ?? ''} onChange={(e) => set(`Roll type ${s}`, e.target.value)}>
                <option value="" disabled>Select</option><option>Profile</option><option>Plain</option>
              </select>
            </label>
          ))}
        </Group>
        <Group title="Work roll dia">{[...R, ...F].map((s) => Num({ k: `Work roll dia ${s}`, label: s, step: '0.01' }))}</Group>

        <div className="ck-group">
          <label className="ck-f"><span>Remark</span><input type="text" value={v.Remark ?? ''} onChange={(e) => set('Remark', e.target.value)} /></label>
        </div>

        <div className="ck-actions">
          <button type="submit" className="ck-save" disabled={!date || status?.kind === 'saving'}>Save</button>
          {status && <span role="status" className={status.kind === 'error' ? 'ck-msg-error' : undefined}>{status.text}</span>}
        </div>
      </form>
    </DrillDrawer>
  );
}
