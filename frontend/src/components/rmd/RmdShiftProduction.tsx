'use client';

/**
 * Production by shift (RMD, LSM), from /api/{mill}/plan:
 *   – targets: the plant's plan (RMD: month-wise FY plan, Prime + SL; LSM: October 2026,
 *     PRODUTION_MT), spread to days, half per shift;
 *   – output per shift: RMD none (the ERP has no shift), so the whole day only; LSM the ERP day
 *     split by the shifts' prime pieces in the logbook's LSM Production Sheet, against that
 *     shift's plan — a period with no shift output shows the whole day only (the user, 28 Oct 2026);
 *   – whole day: ERP Prime + SL against the plan, with compliance and plan gap over the days
 *     that have both (the ERP is entered a day or two late).
 * Running rate as before (ERP production ÷ running hours).
 */
import { useState, type ReactNode } from 'react';
import ShiftBars from '@/components/visualization/ShiftBars';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmdPlanReport } from '@/services/hsmApi';
import { DAY_START_HOUR, dayStartIst, shiftsLabel } from '@/lib/plantDay';
import RmdPlanDrawer, { type PlanMill, type RmdShiftView } from './RmdPlanDrawer';

export default function RmdShiftProduction({ rate, mill = 'rmd' }: { rate: ReactNode; mill?: PlanMill }) {
  const { dates } = useSelection();
  const url = rangeUrl(`/api/${mill}/plan`, dates);
  const s = useApi<RmdPlanReport>(url);
  const plan = s.data && s.dataUrl === url ? s.data : null;
  const t = plan?.totals ?? null;
  const [open, setOpen] = useState<RmdShiftView | null>(null);
  const [lastView, setLastView] = useState<RmdShiftView>('shift');
  // Output per shift: RMD never (the ERP has no shift); LSM / RMS when the period has any — else the whole day only.
  const shiftData = mill === 'rmd' ? false
    : plan ? (['Day', 'Night'] as const).some((n) => t?.shifts?.[n]?.actualMt != null) : null;

  return (
    <>
      <ShiftBars
        shifts={(['Day', 'Night'] as const).map((name) => {
          const s = t?.shifts?.[name];
          // Like the whole day: the target over the days that have the shift's output.
          return { name, planMt: s?.comparedPlanMt ?? t?.byShift[name] ?? null, outputMt: s?.actualMt ?? null, compliancePct: s?.compliancePct ?? null };
        })}
        day={{
          // The whole-day bar compares like with like: the plan over the days the ERP has entered.
          planMt: t ? (t.comparedDays ? t.comparedPlanMt : t.planMt) : null,
          outputMt: t?.actualMt ?? null,
          compliancePct: t?.compliancePct ?? null,
        }}
        planMt={t?.planMt ?? null}
        planGapMt={t?.gapMt ?? null}
        sub={shiftData === false ? `${dayStartIst(DAY_START_HOUR[mill])} → ${dayStartIst(DAY_START_HOUR[mill])}` : shiftsLabel(DAY_START_HOUR[mill])}
        rate={rate}
        shiftData={shiftData}
        onOpen={(v) => { setLastView(v); setOpen(v); }}
      />
      <RmdPlanDrawer open={open !== null} view={open ?? lastView} onClose={() => setOpen(null)} mill={mill} />
    </>
  );
}
