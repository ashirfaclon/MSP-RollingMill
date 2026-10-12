'use client';

/**
 * RMD · Production by shift, from /api/rmd/plan:
 *   – targets: the plant's month-wise FY plan (Prime + SL), spread to days, half per shift;
 *   – output per shift: not in the ERP (entries carry no shift) — NA for now;
 *   – whole day: ERP Prime + SL against the plan, with compliance and plan gap over the days
 *     that have both (the ERP is entered a day or two late).
 * Running rate as before (ERP production ÷ running hours).
 */
import { useState, type ReactNode } from 'react';
import ShiftBars from '@/components/visualization/ShiftBars';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmdPlanReport } from '@/services/hsmApi';
import { DAY_START_HOUR, shiftsLabel } from '@/lib/plantDay';
import RmdPlanDrawer, { type RmdShiftView } from './RmdPlanDrawer';

export default function RmdShiftProduction({ rate }: { rate: ReactNode }) {
  const { dates } = useSelection();
  const url = rangeUrl('/api/rmd/plan', dates);
  const s = useApi<RmdPlanReport>(url);
  const plan = s.data && s.dataUrl === url ? s.data : null;
  const t = plan?.totals ?? null;
  const [open, setOpen] = useState<RmdShiftView | null>(null);
  const [lastView, setLastView] = useState<RmdShiftView>('shift');

  return (
    <>
      <ShiftBars
        shifts={(['Day', 'Night'] as const).map((name) => ({ name, planMt: t?.byShift[name] ?? null, outputMt: null, compliancePct: null }))}
        day={{
          // The whole-day bar compares like with like: the plan over the days the ERP has entered.
          planMt: t ? (t.comparedDays ? t.comparedPlanMt : t.planMt) : null,
          outputMt: t?.actualMt ?? null,
          compliancePct: t?.compliancePct ?? null,
        }}
        planMt={t?.planMt ?? null}
        planGapMt={t?.gapMt ?? null}
        sub={shiftsLabel(DAY_START_HOUR.rmd)}
        rate={rate}
        onOpen={(v) => { setLastView(v); setOpen(v); }}
      />
      <RmdPlanDrawer open={open !== null} view={open ?? lastView} onClose={() => setOpen(null)} />
    </>
  );
}
