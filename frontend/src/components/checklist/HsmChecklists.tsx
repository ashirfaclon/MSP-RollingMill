'use client';

/**
 * HSM Visualization · Checklists — the two checklists the plant shared (Rolling_Mill_Checklists_Data.xlsx),
 * each opening its fill-in form. Preview: the forms work, saving is not connected yet.
 */
import { useState } from 'react';
import Panel from '@/components/Panel';
import VarianceChecklist from './VarianceChecklist';
import SetupChecklist from './SetupChecklist';
import './checklist.css';

export default function HsmChecklists() {
  const [open, setOpen] = useState<'variance' | 'setup' | null>(null);
  return (
    <Panel title="Checklists" className="rm-panel" bodyClass="rm-body">
      <div className="ck-launch">
        <button type="button" className="ck-launch-btn" aria-haspopup="dialog" onClick={() => setOpen('variance')}>
          <b>Production variance checklist</b>
          <span>Influx vs ERP production and the reasons for the difference</span>
        </button>
        <button type="button" className="ck-launch-btn" aria-haspopup="dialog" onClick={() => setOpen('setup')}>
          <b>Shift setup checklist</b>
          <span>Guide settings, edger and pinch roll gaps, roll type and work roll dia</span>
        </button>
      </div>
      <VarianceChecklist open={open === 'variance'} onClose={() => setOpen(null)} />
      <SetupChecklist open={open === 'setup'} onClose={() => setOpen(null)} />
    </Panel>
  );
}
