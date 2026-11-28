'use client';

/**
 * Production vs plan (RMD, LSM, RMS), from /api/{mill}/plan — whole day only (the user, 24 Nov 2026;
 * the per-shift view is kept in git: commit f1222fd, archive/shift-breakdown/):
 *   – target: the plan saved with Edit plan, the day's Day + Night (RMD Prime + SL, LSM PRODUTION_MT,
 *     RMS PRODUCTION_MT);
 *   – output: the ERP's production for the plant day, with compliance and plan gap over the days
 *     that have both (the ERP is entered a day or two late).
 * Running rate as before (ERP production ÷ running hours).
 */
import { useState, type ReactNode } from 'react';
import ShiftBars from '@/components/visualization/ShiftBars';
import { usePlanTrend } from '@/components/visualization/usePlanTrend';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmdPlanReport } from '@/services/hsmApi';
import { DAY_START_HOUR, dayStartIst } from '@/lib/plantDay';
import RmdPlanDrawer, { type PlanMill } from './RmdPlanDrawer';
import PlanConfig from '@/components/plan/PlanConfig';

export default function RmdShiftProduction({ rate, mill = 'rmd' }: { rate: ReactNode; mill?: PlanMill }) {
  const { dates } = useSelection();
  const url = rangeUrl(`/api/${mill}/plan`, dates);
  const s = useApi<RmdPlanReport>(url);
  const plan = s.data && s.dataUrl === url ? s.data : null;
  const t = plan?.totals ?? null;
  const trend = usePlanTrend(`/api/${mill}/plan`, dates, plan?.days ?? null);
  const [open, setOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const start = dayStartIst(DAY_START_HOUR[mill]);

  return (
    <>
      <ShiftBars
        day={{
          // The whole-day bar compares like with like: the plan over the days the ERP has entered.
          planMt: t ? (t.comparedDays ? t.comparedPlanMt : t.planMt) : null,
          outputMt: t?.actualMt ?? null,
          compliancePct: t?.compliancePct ?? null,
        }}
        planMt={t?.planMt ?? null}
        planGapMt={t?.gapMt ?? null}
        sub={`${start} → ${start}`}
        rate={rate}
        trend={trend}
        loading={!plan}
        onOpen={() => setOpen(true)}
        onEditPlan={() => setPlanOpen(true)}
      />
      <RmdPlanDrawer open={open} onClose={() => setOpen(false)} mill={mill} />
      <PlanConfig mill={mill} open={planOpen} onClose={() => setPlanOpen(false)} />
    </>
  );
}
