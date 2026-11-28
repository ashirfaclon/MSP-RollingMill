'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import ShiftPlanDrawer from '@/components/drill/ShiftPlanDrawer';
import RunningRateFoot from '@/components/production/RunningRateFoot';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type PlanReport } from '@/services/hsmApi';
import ShiftBars from './ShiftBars';
import { usePlanTrend } from './usePlanTrend';
import PlanConfig from '@/components/plan/PlanConfig';

/**
 * HSM · Production vs plan, all from /api/hsm/plan — whole day only (the user, 24 Nov 2026; the
 * per-shift view is kept in git: commit f1222fd, archive/shift-breakdown/):
 *   – output: the Production card's figure for the plant day (08:00 → 08:00 IST);
 *   – target: the logbook Production Plan form (HSM ROLLING PLAN, saved with Edit plan), the day's
 *     Day + Night as written there; NA where the period has no plan;
 *   – compliance: actual ÷ plan × 100 over the planned days;
 *   – plan gap: production − plan over the planned days only ("+" ahead; short, no sign).
 * Running rate is live (RunningRateFoot).
 */
/** `actions`: more header buttons (the Production variance checklist). */
export default function ShiftProduction({ actions }: { actions?: ReactNode }) {
  const { dates } = useSelection();
  const url = rangeUrl('/api/hsm/plan', dates);
  const s = useApi<PlanReport>(url);
  const plan = s.data && s.dataUrl === url ? s.data : null;
  const planned = !!plan && plan.totals.plannedDays > 0;
  const trend = usePlanTrend('/api/hsm/plan', dates, plan?.days ?? null);
  const [open, setOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const comply = (actual: number | null, target: number | null) => (actual === null || !target ? null : (actual / target) * 100);
  const totalOut = plan ? Object.values(plan.totals.actualByShift).reduce((a, v) => a + v, 0) : null;

  return (
    <>
    <ShiftBars
      actions={actions}
      day={{
        planMt: plan?.totals.planMt ?? null,
        outputMt: totalOut,
        compliancePct: planned ? comply(plan!.totals.actualMt, plan!.totals.planMt) : null,
      }}
      planMt={plan?.totals.planMt ?? null}
      planGapMt={plan?.totals.gapMt ?? null}
      sub={planned && plan!.totals.plannedDays < plan!.totals.days
        ? `Plan covers ${plan!.totals.plannedDays} of ${plan!.totals.days} days · gap over those`
        : '08:00 IST → 08:00 IST'}
      rate={<RunningRateFoot />}
      trend={trend}
      lateText="has no counter data yet"
      loading={!plan}
      onOpen={() => setOpen(true)}
      onEditPlan={() => setPlanOpen(true)}
    />
    <ShiftPlanDrawer open={open} onClose={() => setOpen(false)} />
    <PlanConfig mill="hsm" open={planOpen} onClose={() => setPlanOpen(false)} />
    </>
  );
}
