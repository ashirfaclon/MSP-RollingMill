'use client';

/**
 * HSM · Shift setup checklist — the plant's "Checklist" sheet (Rolling_Mill_Checklists_Data.xlsx)
 * as a form, field for field: who is on shift, RM / FM guide settings, vertical edger and pinch
 * roll gaps, roll type (R1–R5) and work roll diameter (R1–R5, F1–F6). Nothing here is in any
 * system yet, so everything is typed. Preview only: saving is not connected yet.
 */
import { useState, type ReactNode } from 'react';
import DrillDrawer from '@/components/drill/DrillDrawer';
import { useSelection } from '@/services/hsmProduction';
import './checklist.css';

const R = ['R1', 'R2', 'R3', 'R4', 'R5'];
const F = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'];

function Num({ label, step = '1' }: { label: string; step?: string }) {
  return <label className="ck-f"><span>{label}</span><input type="number" step={step} inputMode="decimal" /></label>;
}

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
  const [date, setDate] = useState('');
  return (
    <DrillDrawer open={open} onClose={onClose} title="Shift setup checklist" sub="HSM · mill settings" loading={false} error={null} hasData>
      <form className="ck-form" onSubmit={(e) => e.preventDefault()} aria-label="Shift setup checklist">
        <div className="ck-group">
          <div className="ck-grid ck-grid--wide">
            <label className="ck-f"><span>Date</span>
              <input type="date" value={date || today || ''} max={today ?? undefined} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="ck-f"><span>Shift</span><select defaultValue="Day"><option>Day</option><option>Night</option></select></label>
            <label className="ck-f"><span>Shift in-charge</span><input type="text" /></label>
            <label className="ck-f"><span>Employee ID</span><input type="text" /></label>
            <Num label="Manpower availability" />
          </div>
        </div>

        <Group title="RM guide setting">{R.map((s) => <Num key={s} label={s} />)}</Group>
        <Group title="FM guide setting">{F.map((s) => <Num key={s} label={s} />)}</Group>
        <Group title="Vertical edger gap · pinch roll gap">
          <Num label="V1" />
          <Num label="V2" />
          <Num label="Vertical pinch roll gap" step="0.01" />
        </Group>
        <Group title="Roll type">
          {R.map((s) => (
            <label className="ck-f" key={s}><span>{s}</span>
              <select defaultValue=""><option value="" disabled>Select</option><option>Profile</option><option>Plain</option></select>
            </label>
          ))}
        </Group>
        <Group title="Work roll dia">{[...R, ...F].map((s) => <Num key={s} label={s} step="0.01" />)}</Group>

        <div className="ck-group">
          <label className="ck-f"><span>Remark</span><input type="text" /></label>
        </div>

        <div className="ck-actions">
          <button type="submit" className="ck-save" disabled>Save</button>
          <span>Preview — saving is not connected yet</span>
        </div>
      </form>
    </DrillDrawer>
  );
}
