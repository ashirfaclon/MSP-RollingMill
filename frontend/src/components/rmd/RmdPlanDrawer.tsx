'use client';

/**
 * RMD Production by shift drill-down — the plan against ERP Prime + SL, per day / week / month
 * over the dashboard's period, in the card's view:
 *   BY SHIFT   each shift's target (half the day's plan); output per shift is not in the ERP: NA;
 *   WHOLE DAY  ERP Prime + SL against the day's plan, with compliance and plan gap.
 * Gap and compliance compare only the days that have both plan and ERP production.
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox, { type SourceSystem } from '@/components/drill/SourceBox';
import { useDrillRange } from '@/components/drill/useDrillRange';
import { groupDays } from '@/lib/periods';
import { dm } from '@/services/hsmProduction';
import type { Grain } from '@contracts';
import { rangeUrl, useApi, type RmdPlanDay, type RmdPlanReport } from '@/services/hsmApi';

export type RmdShiftView = 'shift' | 'day';
const SHIFTS = ['Day', 'Night'] as const;

const f = (v: number | null | undefined) => (v === null || v === undefined ? '—' : fmtNum(v, 1));
const pct = (v: number | null) => (v === null ? 'NA' : `${fmtNum(v, 1)}%`);
const gapTone = (v: number | null) => (v === null ? 'v-na' : v > 0 ? 'v-warn' : 'v-ok');
const compTone = (v: number | null) => (v === null ? 'v-na' : v >= 100 ? 'v-ok' : 'v-warn');

interface Period {
  key: string; label: string; fromDate: string; toDate: string;
  plan: number | null;
  shiftPlan: Record<string, number | null>;
  /** ERP Prime + SL over the days with an entry. */
  out: number | null;
  /** Over the days with both plan and ERP production. */
  gap: number | null;
  compliance: number | null;
}

function periods(days: RmdPlanDay[], grain: Grain): Period[] {
  return groupDays(days, grain).map((g) => {
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const planned = g.days.filter((d) => d.planMt !== null);
    const both = planned.filter((d) => d.actualMt !== null);
    const entered = g.days.filter((d) => d.actualMt !== null);
    const cPlan = both.length ? sum(both.map((d) => d.planMt!)) : null;
    const cOut = both.length ? sum(both.map((d) => d.actualMt!)) : null;
    return {
      key: g.key, label: g.label, fromDate: g.fromDate, toDate: g.toDate,
      plan: planned.length ? sum(planned.map((d) => d.planMt!)) : null,
      shiftPlan: Object.fromEntries(SHIFTS.map((s) => [s, planned.length ? sum(planned.map((d) => d.byShift[s] ?? 0)) : null])),
      out: entered.length ? sum(entered.map((d) => d.actualMt!)) : null,
      gap: cPlan !== null && cOut !== null ? cPlan - cOut : null,
      compliance: cPlan && cOut !== null ? (cOut / cPlan) * 100 : null,
    };
  });
}

export default function RmdPlanDrawer({ open, onClose, view }: { open: boolean; onClose: () => void; view: RmdShiftView }) {
  const r = useDrillRange(['selection'], 'selection');
  const url = open && r.dates ? rangeUrl('/api/rmd/plan', r.dates) : null;
  const { data, dataUrl, loading, error } = useApi<RmdPlanReport>(url);
  return (
    <DrillDrawer
      open={open}
      onClose={onClose}
      title={view === 'day' ? 'Production · whole day · plan vs actual' : 'Production by shift · plan'}
      sub="RMD · MT"
      controls={r.controls}
      loading={loading}
      stale={!!data && dataUrl !== url}
      error={error}
      hasData={!!data}
    >
      {data && (view === 'day' ? <DayContent data={data} grain={r.grain} /> : <ShiftContent data={data} grain={r.grain} />)}
    </DrillDrawer>
  );
}

const label = (x: Period) => <td><b>{x.label}</b>{x.fromDate !== x.toDate && <span className="pd-dim"> · {dm(x.fromDate)}–{dm(x.toDate)}</span>}</td>;

const DAY_PLAN = 'Day plan = month plan ÷ calendar days (shutdown dates not given), Prime + SL';

function ShiftContent({ data, grain }: { data: RmdPlanReport; grain: Grain }) {
  const t = data.totals;
  const rows = useMemo(() => periods(data.days, grain), [data.days, grain]);
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  // Day and Night targets are equal (half the day each): one series.
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'shift-plan', name: 'Target per shift', token: '--gold', type: 'column', data: rows.map((x) => x.shiftPlan.Day), dp: 1 },
  ], [rows]);
  const axes = useMemo(() => [{ title: 'MT', unit: 'MT' }], []);
  return (
    <>
      <Stats items={[
        ...SHIFTS.map((s) => ({ label: s, value: 'NA', unit: `MT · target ${f(t.byShift[s])}`, tone: 'v-na' })),
        { label: 'Plan', value: f(t.planMt), unit: 'MT' },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Target per shift: ${rows.map((x) => `${x.label} ${f(x.shiftPlan.Day)} MT`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Production by shift by period">
          <thead><tr><th>Period</th><th className="r">Day output</th><th className="r">Day target</th><th className="r">Night output</th><th className="r">Night target</th></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.key}>{label(x)}<td className="num r v-na">NA</td><td className="num r">{f(x.shiftPlan.Day)}</td><td className="num r v-na">NA</td><td className="num r">{f(x.shiftPlan.Night)}</td></tr>
            ))}
          </tbody>
          <tfoot><tr><td>Total</td><td className="num r v-na">NA</td><td className="num r">{f(t.byShift.Day)}</td><td className="num r v-na">NA</td><td className="num r">{f(t.byShift.Night)}</td></tr></tfoot>
        </table>
      </div>
      <SourceBox sources={[PLAN_SOURCE]} formula={[
        DAY_PLAN,
        'Shift target = day plan ÷ 2  (Day 08:00–20:00 IST, Night 20:00–08:00 IST)',
      ]} />
    </>
  );
}

function DayContent({ data, grain }: { data: RmdPlanReport; grain: Grain }) {
  const t = data.totals;
  const rows = useMemo(() => periods(data.days, grain), [data.days, grain]);
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'out', name: 'Prime + SL', token: '--s-prod', type: 'column', data: rows.map((x) => x.out), dp: 1 },
    { id: 'plan', name: 'Target', token: '--gold', type: 'line', dashed: true, data: rows.map((x) => x.plan), dp: 1 },
  ], [rows]);
  const axes = useMemo(() => [{ title: 'MT', unit: 'MT' }], []);
  return (
    <>
      <Stats items={[
        { label: 'Prime + SL', value: t.actualMt === null ? 'NA' : f(t.actualMt), unit: `MT · target ${f(t.comparedPlanMt ?? t.planMt)}`, tone: t.actualMt === null ? 'v-na' : undefined },
        { label: 'Compliance', value: pct(t.compliancePct), unit: '', tone: compTone(t.compliancePct) },
        { label: 'Plan gap', value: f(t.gapMt), unit: 'MT', tone: gapTone(t.gapMt) },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Whole-day production: ${rows.map((x) => `${x.label} ${f(x.out)} of ${f(x.plan)}`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Whole-day production by period">
          <thead><tr><th>Period</th><th className="r">Prime + SL</th><th className="r">Target</th><th className="r">Compliance</th><th className="r">Plan gap</th></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.key}>{label(x)}
                <td className={`num r ${x.out === null ? 'v-na' : 'v-val'}`}>{x.out === null ? 'NA' : f(x.out)}</td>
                <td className="num r">{f(x.plan)}</td>
                <td className={`num r ${compTone(x.compliance)}`}>{pct(x.compliance)}</td>
                <td className={`num r ${gapTone(x.gap)}`}>{f(x.gap)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="num r">{t.actualMt === null ? 'NA' : f(t.actualMt)}</td>
              <td className="num r">{f(t.planMt)}</td>
              <td className={`num r ${compTone(t.compliancePct)}`}>{pct(t.compliancePct)}</td>
              <td className={`num r ${gapTone(t.gapMt)}`}>{f(t.gapMt)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <SourceBox sources={[ERP_SOURCE, PLAN_SOURCE]} formula={[
        DAY_PLAN,
        'Compliance = PRODUCT_PRIME_SLENGTH_MT ÷ plan × 100  (days with both)',
        'Plan gap = plan − PRODUCT_PRIME_SLENGTH_MT  (days with both)',
      ]} />
    </>
  );
}

const PLAN_SOURCE: SourceSystem = {
  name: 'Plan',
  rows: [
    ['File', 'RMD Month Wise production plan FY 26-27, sheet Production Plan'],
    ['Field', 'TOTAL PRODUCTION — PRIME + SHORT LENGTH (MT), on line + off line, per month'],
  ],
};

const ERP_SOURCE: SourceSystem = {
  name: 'ERP',
  rows: [
    ['Table', 'ATTR_TRAN_DATA_BODY'],
    ['Filter', "USER_CODE = 'FA-SKJ'"],
    ['Field', "ATTR_CODE = 'PRODUCT_PRIME_SLENGTH_MT' (value in ATTR_VALUE)"],
  ],
};
