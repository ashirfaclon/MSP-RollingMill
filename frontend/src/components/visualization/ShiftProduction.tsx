'use client';

import { useState } from 'react';
import type { MillModel } from '@/models/millModel';
import ShiftPlanDrawer, { type ShiftView } from '@/components/drill/ShiftPlanDrawer';
import RunningRateFoot from '@/components/production/RunningRateFoot';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type PlanReport } from '@/services/hsmApi';
import ShiftBars from './ShiftBars';

/**
 * HSM · Production by shift, all from /api/hsm/plan:
 *   – output per shift: the Production card's figure split Day 06–18 / Night 18–06 by where the
 *     counter's ticks fell (Day + Night = the card);
 *   – targets: the rolling plan (today a static import of the plant's Excel), per shift
 *     exactly as written there; NA where the period has no plan;
 *   – plan gap: production − plan over the planned days only ("+" ahead; short, no sign);
 *   – compliance: actual ÷ plan × 100 over those same planned days — per shift (NA where the
 *     shift's target is 0) and, on the card's back face, for the whole day.
 * Running rate is live (RunningRateFoot).
 */
export default function ShiftProduction({ m }: { m: MillModel }) {
  const { dates } = useSelection();
  const url = rangeUrl('/api/hsm/plan', dates);
  const s = useApi<PlanReport>(url);
  const plan = s.data && s.dataUrl === url ? s.data : null;
  const planned = !!plan && plan.totals.plannedDays > 0;
  /** The drawer opens in the card's view (by shift / whole day); null = closed. */
  const [open, setOpen] = useState<ShiftView | null>(null);
  const [lastView, setLastView] = useState<ShiftView>('shift');
  // Output over the PLANNED days only, so compliance compares like with like.
  const plannedDays = plan ? plan.days.filter((d) => d.planMt !== null) : [];
  const plannedOut = (shift: string) => plannedDays.reduce((a, d) => a + (d.actualByShift?.[shift] ?? 0), 0);
  const comply = (actual: number | null, target: number | null) => (actual === null || !target ? null : (actual / target) * 100);
  const totalOut = plan ? Object.values(plan.totals.actualByShift).reduce((a, v) => a + v, 0) : null;

  return (
    <>
    <ShiftBars
      shifts={m.shifts.map((sh) => ({
        name: sh.name,
        // A planned period with no row for this shift is a 0 target, as filled; no plan at all is NA.
        planMt: planned ? plan!.totals.byShift[sh.name] ?? 0 : null,
        outputMt: plan ? plan.totals.actualByShift[sh.name] ?? 0 : null,
        compliancePct: planned ? comply(plannedOut(sh.name), plan!.totals.byShift[sh.name] ?? 0) : null,
      }))}
      day={{
        planMt: plan?.totals.planMt ?? null,
        outputMt: totalOut,
        compliancePct: planned ? comply(plan!.totals.actualMt, plan!.totals.planMt) : null,
      }}
      planMt={plan?.totals.planMt ?? null}
      planGapMt={plan?.totals.gapMt ?? null}
      sub={planned && plan!.totals.plannedDays < plan!.totals.days
        ? `Plan covers ${plan!.totals.plannedDays} of ${plan!.totals.days} days · gap over those`
        : undefined}
      rate={<RunningRateFoot />}
      onOpen={(v) => { setLastView(v); setOpen(v); }}
    />
    <ShiftPlanDrawer open={open !== null} view={open ?? lastView} onClose={() => setOpen(null)} />
    </>
  );
}
