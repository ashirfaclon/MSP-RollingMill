'use client';

/**
 * HSM Visualization · Checklists — the two checklists the plant shared (Rolling_Mill_Checklists_Data.xlsx),
 * each opening its fill-in form, saved to the logbook (HSM Checklists forms). Two small buttons in the
 * Material & operating balance header, not a panel of their own (the user, 31 Oct 2026).
 */
import { useState } from 'react';
import VarianceChecklist from './VarianceChecklist';
import SetupChecklist from './SetupChecklist';
import '@/components/plan/plan.css';
import './checklist.css';

export default function HsmChecklists() {
  const [open, setOpen] = useState<'variance' | 'setup' | null>(null);
  return (
    <span className="ck-head-btns">
      <button type="button" className="rm-plan-edit" aria-haspopup="dialog" onClick={() => setOpen('variance')}
        title="Influx vs ERP production and the reasons for the difference">Production variance checklist</button>
      <button type="button" className="rm-plan-edit" aria-haspopup="dialog" onClick={() => setOpen('setup')}
        title="Guide settings, edger and pinch roll gaps, roll type and work roll dia">Shift setup checklist</button>
      <VarianceChecklist open={open === 'variance'} onClose={() => setOpen(null)} />
      <SetupChecklist open={open === 'setup'} onClose={() => setOpen(null)} />
    </span>
  );
}
