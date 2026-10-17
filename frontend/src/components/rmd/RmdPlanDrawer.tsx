'use client';

/**
 * Production by shift drill-down (RMD, LSM) — the plan against ERP production, per day / week /
 * month over the dashboard's period, in the card's view:
 *   BY SHIFT   each shift's target (half the day's plan) and output — RMD NA (the ERP has no
 *              shift), LSM the ERP day split by the shifts' prime pieces (LSM Production Sheet);
 *   WHOLE DAY  ERP production against the day's plan, with compliance and plan gap.
 * Gap and compliance compare only the days that have both plan and ERP production. RMD measures
 * Prime + SL (PRODUCT_PRIME_SLENGTH_MT), LSM PRODUTION_MT.
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
export type PlanMill = 'rmd' | 'lsm' | 'rms';

/** What differs between the mills: the measure, the shifts, the plan file and the ERP field. */
interface MillPlan {
  sub: string; measure: string; field: string; dayPlan: string; shifts: string; plan: SourceSystem; erp: SourceSystem;
  /** Where output per shift comes from; none = NA. */
  split?: { source: SourceSystem; formula: string[] };
}
const MILL: Record<PlanMill, MillPlan> = {
  rmd: {
    sub: 'RMD · MT',
    measure: 'Prime + SL',
    field: 'PRODUCT_PRIME_SLENGTH_MT',
    dayPlan: 'Day plan = month plan ÷ calendar days (shutdown dates not given), Prime + SL',
    shifts: 'Shift target = day plan ÷ 2  (Day 08:00–20:00 IST, Night 20:00–08:00 IST)',
    plan: { name: 'Plan', rows: [
      ['File', 'RMD Month Wise production plan FY 26-27, sheet Production Plan'],
      ['Field', 'TOTAL PRODUCTION — PRIME + SHORT LENGTH (MT), on line + off line, per month'],
    ] },
    erp: { name: 'ERP', rows: [
      ['Table', 'ATTR_TRAN_DATA_BODY'],
      ['Filter', "USER_CODE = 'FA-SKJ'"],
      ['Field', "ATTR_CODE = 'PRODUCT_PRIME_SLENGTH_MT' (value in ATTR_VALUE)"],
    ] },
  },
  lsm: {
    sub: 'LSM · MT',
    measure: 'Production',
    field: 'PRODUTION_MT',
    dayPlan: 'Day plan = month plan ÷ 31 days (October 2026: 8,750 MT, no shutdown)',
    shifts: 'Shift target = day plan ÷ 2  (Day 09:00–21:00 IST, Night 21:00–09:00 IST)',
    plan: { name: 'Plan', rows: [
      ['File', 'PRODUCTION PLAN FOR LSM Oct-2026, Sheet1'],
      ['Field', 'TOTAL PRODUCTION (MT), October 2026'],
    ] },
    erp: { name: 'ERP', rows: [
      ['Table', 'ATTR_TRAN_DATA_BODY'],
      ['Filter', "USER_CODE = 'FA-LP-P' (division LS)"],
      ['Field', "ATTR_CODE = 'PRODUTION_MT' (value in ATTR_VALUE)"],
    ] },
    split: {
      source: { name: 'Logbook', rows: [
        ['Form', 'Light Structure Mill → LSM Production Sheet → PRODUCTION SHEET'],
        ['Field', 'prime (pcs) per entry, by its date and shift (DAY / NIGHT)'],
      ] },
      formula: [
        'Day output = PRODUTION_MT × Day prime pcs ÷ (Day + Night prime pcs); Night the same',
        'Shift compliance = shift output ÷ shift target × 100  (days with both)',
      ],
    },
  },
  rms: {
    sub: 'RMS · MT',
    measure: 'Production',
    field: 'PRODUCTION_MT',
    dayPlan: 'Day plan = month plan ÷ calendar days (shutdown dates not given)',
    shifts: 'Shift target = day plan ÷ 2  (Day 09:30–21:30 IST, Night 21:30–09:30 IST)',
    plan: { name: 'Plan', rows: [
      ['File', 'RMS_Production_Plan (one workbook per month, April–October 2026)'],
      ['Field', 'TOTAL PRODUCTION (MT), per month'],
    ] },
    erp: { name: 'ERP', rows: [
      ['Table', 'ATTR_TRAN_DATA_HEAD + ATTR_TRAN_DATA_BODY'],
      ['Filter', "ENTITY_CODE = 'MP', DIV_CODE = 'RS', TNATURE = 'PRLOG', SERIES = 'L5P'"],
      ['Field', "ATTR_CODE = 'PRODUCTION_MT' (value in ATTR_VALUE)"],
    ] },
    split: {
      source: { name: 'Logbook', rows: [
        ['Form', 'Rolling Mill Structure (RMS) → RMS Production Sheet → PRODUCTION SHEET'],
        ['Field', 'prime (pcs) per entry, by its date and shift (DAY / NIGHT)'],
      ] },
      formula: [
        'Day output = PRODUCTION_MT × Day prime pcs ÷ (Day + Night prime pcs); Night the same',
        'Shift compliance = shift output ÷ shift target × 100  (days with both)',
      ],
    },
  },
};
const SHIFTS = ['Day', 'Night'] as const;

const f = (v: number | null | undefined) => (v === null || v === undefined ? '—' : fmtNum(v, 1));
const pct = (v: number | null) => (v === null ? 'NA' : `${fmtNum(v, 1)}%`);
const gapTone = (v: number | null) => (v === null ? 'v-na' : v < 0 ? 'v-warn' : 'v-ok');
/** Plan gap (production − plan): "+" when ahead of plan; short of it, the number alone (the user, 17 Oct 2026). */
const g = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${fmtNum(Math.abs(v), 1)}`);
const compTone = (v: number | null) => (v === null ? 'v-na' : v >= 100 ? 'v-ok' : 'v-warn');

interface Period {
  key: string; label: string; fromDate: string; toDate: string;
  plan: number | null;
  shiftPlan: Record<string, number | null>;
  /** ERP Prime + SL over the days with an entry. */
  out: number | null;
  /** Output per shift over the days that have it (LSM); null without. */
  shiftOut: Record<string, number | null>;
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
      shiftOut: Object.fromEntries(SHIFTS.map((s) => {
        const split = g.days.filter((d) => d.actualByShift?.[s] != null);
        return [s, split.length ? sum(split.map((d) => d.actualByShift![s]!)) : null];
      })),
      gap: cPlan !== null && cOut !== null ? cOut - cPlan : null,
      compliance: cPlan && cOut !== null ? (cOut / cPlan) * 100 : null,
    };
  });
}

export default function RmdPlanDrawer({ open, onClose, view, mill = 'rmd' }: { open: boolean; onClose: () => void; view: RmdShiftView; mill?: PlanMill }) {
  const r = useDrillRange(['selection'], 'selection');
  const url = open && r.dates ? rangeUrl(`/api/${mill}/plan`, r.dates) : null;
  const m = MILL[mill];
  const { data, dataUrl, loading, error } = useApi<RmdPlanReport>(url);
  return (
    <DrillDrawer
      open={open}
      onClose={onClose}
      title={view === 'day' ? 'Production · whole day · plan vs actual' : 'Production by shift · plan'}
      sub={m.sub}
      controls={r.controls}
      loading={loading}
      stale={!!data && dataUrl !== url}
      error={error}
      hasData={!!data}
    >
      {data && (view === 'day' ? <DayContent data={data} grain={r.grain} m={m} /> : <ShiftContent data={data} grain={r.grain} m={m} />)}
    </DrillDrawer>
  );
}

const label = (x: Period) => <td><b>{x.label}</b>{x.fromDate !== x.toDate && <span className="pd-dim"> · {dm(x.fromDate)}–{dm(x.toDate)}</span>}</td>;

function ShiftContent({ data, grain, m }: { data: RmdPlanReport; grain: Grain; m: MillPlan }) {
  const t = data.totals;
  const rows = useMemo(() => periods(data.days, grain), [data.days, grain]);
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  // Day and Night targets are equal (half the day each): one series; output per shift beside it where there is one.
  const series = useMemo<DrillSeries[]>(() => [
    ...(m.split ? [
      { id: 'day-out', name: 'Day output', token: '--s-prod', type: 'column' as const, data: rows.map((x) => x.shiftOut.Day), dp: 1 },
      { id: 'night-out', name: 'Night output', token: '--s-order', type: 'column' as const, data: rows.map((x) => x.shiftOut.Night), dp: 1 },
    ] : []),
    { id: 'shift-plan', name: 'Target per shift', token: '--gold', type: m.split ? 'line' : 'column', dashed: !!m.split, data: rows.map((x) => x.shiftPlan.Day), dp: 1 },
  ], [rows, m.split]);
  const outCell = (v: number | null) => <td className={`num r ${v === null ? 'v-na' : 'v-val'}`}>{v === null ? 'NA' : f(v)}</td>;
  const axes = useMemo(() => [{ title: 'MT', unit: 'MT' }], []);
  return (
    <>
      <Stats items={[
        ...SHIFTS.map((s) => {
          const o = t.shifts?.[s];
          return o?.actualMt != null
            ? { label: s, value: f(o.actualMt), unit: `MT · target ${f(o.comparedPlanMt)}` }
            : { label: s, value: 'NA', unit: `MT · target ${f(t.byShift[s])}`, tone: 'v-na' };
        }),
        { label: 'Plan', value: f(t.planMt), unit: 'MT' },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={m.split
          ? `Output per shift against the target: ${rows.map((x) => `${x.label} Day ${f(x.shiftOut.Day)}, Night ${f(x.shiftOut.Night)} of ${f(x.shiftPlan.Day)} MT`).join('; ')}`
          : `Target per shift: ${rows.map((x) => `${x.label} ${f(x.shiftPlan.Day)} MT`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Production by shift by period">
          <thead><tr><th>Period</th><th className="r">Day output</th><th className="r">Day target</th><th className="r">Night output</th><th className="r">Night target</th></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.key}>{label(x)}{outCell(x.shiftOut.Day)}<td className="num r">{f(x.shiftPlan.Day)}</td>{outCell(x.shiftOut.Night)}<td className="num r">{f(x.shiftPlan.Night)}</td></tr>
            ))}
          </tbody>
          <tfoot><tr><td>Total</td>{outCell(t.shifts?.Day?.actualMt ?? null)}<td className="num r">{f(t.byShift.Day)}</td>{outCell(t.shifts?.Night?.actualMt ?? null)}<td className="num r">{f(t.byShift.Night)}</td></tr></tfoot>
        </table>
      </div>
      <SourceBox sources={m.split ? [m.erp, m.split.source, m.plan] : [m.plan]} formula={[m.dayPlan, m.shifts, ...(m.split?.formula ?? [])]} />
    </>
  );
}

function DayContent({ data, grain, m }: { data: RmdPlanReport; grain: Grain; m: MillPlan }) {
  const t = data.totals;
  const rows = useMemo(() => periods(data.days, grain), [data.days, grain]);
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'out', name: m.measure, token: '--s-prod', type: 'column', data: rows.map((x) => x.out), dp: 1 },
    { id: 'plan', name: 'Target', token: '--gold', type: 'line', dashed: true, data: rows.map((x) => x.plan), dp: 1 },
  ], [rows, m.measure]);
  const axes = useMemo(() => [{ title: 'MT', unit: 'MT' }], []);
  return (
    <>
      <Stats items={[
        { label: m.measure, value: t.actualMt === null ? 'NA' : f(t.actualMt), unit: `MT · target ${f(t.comparedPlanMt ?? t.planMt)}`, tone: t.actualMt === null ? 'v-na' : undefined },
        { label: 'Compliance', value: pct(t.compliancePct), unit: '', tone: compTone(t.compliancePct) },
        { label: 'Plan gap', value: g(t.gapMt), unit: 'MT', tone: gapTone(t.gapMt) },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Whole-day production: ${rows.map((x) => `${x.label} ${f(x.out)} of ${f(x.plan)}`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Whole-day production by period">
          <thead><tr><th>Period</th><th className="r">{m.measure}</th><th className="r">Target</th><th className="r">Compliance</th><th className="r">Plan gap</th></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.key}>{label(x)}
                <td className={`num r ${x.out === null ? 'v-na' : 'v-val'}`}>{x.out === null ? 'NA' : f(x.out)}</td>
                <td className="num r">{f(x.plan)}</td>
                <td className={`num r ${compTone(x.compliance)}`}>{pct(x.compliance)}</td>
                <td className={`num r ${gapTone(x.gap)}`}>{g(x.gap)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="num r">{t.actualMt === null ? 'NA' : f(t.actualMt)}</td>
              <td className="num r">{f(t.planMt)}</td>
              <td className={`num r ${compTone(t.compliancePct)}`}>{pct(t.compliancePct)}</td>
              <td className={`num r ${gapTone(t.gapMt)}`}>{g(t.gapMt)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <SourceBox sources={[m.erp, m.plan]} formula={[
        m.dayPlan,
        `Compliance = ${m.field} ÷ plan × 100  (days with both)`,
        `Plan gap = ${m.field} − plan  (days with both); + = ahead of plan, no sign = short`,
      ]} />
    </>
  );
}
