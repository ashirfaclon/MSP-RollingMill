'use client';

/**
 * HSM Visualization · Checklists — the two checklists the plant shared (Rolling_Mill_Checklists_Data.xlsx),
 * each opening its fill-in form, saved to the logbook (HSM Checklists forms). Each button sits in the
 * header of the panel its content belongs to (the user, 31 Oct 2026):
 *   Production variance  Influx vs ERP production and why → Production by shift;
 *   Shift setup          guide settings, roll gaps, roll type, work roll dia per stand → Mill mimic.
 */
import { useState } from 'react';
import VarianceChecklist from './VarianceChecklist';
import SetupChecklist from './SetupChecklist';
import '@/components/plan/plan.css';
import './checklist.css';

const SPEC = {
  variance: { label: 'Production variance checklist', title: 'Influx vs ERP production and the reasons for the difference' },
  setup: { label: 'Shift setup checklist', title: 'Guide settings, edger and pinch roll gaps, roll type and work roll dia, per stand' },
} as const;

export default function ChecklistButton({ kind }: { kind: keyof typeof SPEC }) {
  const [open, setOpen] = useState(false);
  const s = SPEC[kind];
  return (
    <>
      <button type="button" className="rm-plan-edit rm-plan-edit--checklist" aria-haspopup="dialog" onClick={() => setOpen(true)} title={s.title}>
        {s.label}
      </button>
      {kind === 'variance'
        ? <VarianceChecklist open={open} onClose={() => setOpen(false)} />
        : <SetupChecklist open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
