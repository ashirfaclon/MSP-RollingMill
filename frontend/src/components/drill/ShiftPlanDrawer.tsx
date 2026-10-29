'use client';

/**
 * Production by shift drill-down — output against the plan target, per day / week / month
 * over the dashboard's period, and the plan gap: which days missed. It follows the card's
 * view: BY SHIFT (each shift against its own target) or WHOLE DAY (all shifts together
 * against the day's plan, with its compliance).
 * Everything comes from /api/hsm/plan; the grouping is done here.
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from './DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from './DrillChart';
import SourceBox, { type SourceSystem } from './SourceBox';
import { useDrillRange } from './useDrillRange';
import { groupDays } from '@/lib/periods';
import { dm } from '@/services/hsmProduction';
import type { Grain } from '@contracts';
import { rangeUrl, useApi, type PlanDay, type PlanReport } from '@/services/hsmApi';

const SHIFTS = ['Day', 'Night'] as const;
const TOKENS: Record<(typeof SHIFTS)[number], { out: string; plan: string }> = {
  Day: { out: '--s-prod', plan: '--s-prod' },
  Night: { out: '--s-order', plan: '--s-order' },
};

interface ShiftPeriod {
  key: string; label: string; fromDate: string; toDate: string;
  /** shift → output MT (null when the counter had nothing). */
  out: Record<string, number | null>;
  /** shift → target MT over the planned days; null when no day of the period is planned. */
  plan: Record<string, number | null>;
  /** Σ plan − Σ production over the planned days; null when none is planned. */
  gap: number | null;
  /** All shifts together: output, plan, and compliance (actual ÷ plan over the planned days). */
  all: { out: number | null; plan: number | null; compliance: number | null };
}

export type ShiftView = 'shift' | 'day';

const sumOrNull = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

function shiftPeriods(days: PlanDay[], grain: Grain): ShiftPeriod[] {
  return groupDays(days, grain).map((g) => {
    const planned = g.days.filter((d) => d.planMt !== null);
    const out: Record<string, number | null> = {};
    const plan: Record<string, number | null> = {};
    for (const s of SHIFTS) {
      out[s] = sumOrNull(g.days.map((d) => (d.actualByShift ? d.actualByShift[s] ?? 0 : null)));
      // A planned day with no row for this shift is a 0 target, as filled.
      plan[s] = planned.length ? planned.reduce((a, d) => a + (d.byShift[s] ?? 0), 0) : null;
    }
    const planMt = sumOrNull(planned.map((d) => d.planMt));
    const actual = sumOrNull(planned.map((d) => d.actualMt));
    const all = {
      out: sumOrNull(g.days.map((d) => (d.actualByShift ? Object.values(d.actualByShift).reduce((a, v) => a + v, 0) : null))),
      plan: planMt,
      compliance: planMt && actual !== null ? (actual / planMt) * 100 : null,
    };
    return { key: g.key, label: g.label, fromDate: g.fromDate, toDate: g.toDate, out, plan, gap: planMt === null || actual === null ? null : actual - planMt, all };
  });
}

const f = (v: number | null | undefined) => (v === null || v === undefined ? '—' : fmtNum(v, 1));
const gapTone = (v: number | null) => (v === null ? 'v-na' : v < 0 ? 'v-warn' : 'v-ok');
/** Plan gap (production − plan): "+" when ahead of plan; short of it, the number alone (the user, 17 Oct 2026). */
const g = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${fmtNum(Math.abs(v), 1)}`);

export default function ShiftPlanDrawer({ open, onClose, view }: { open: boolean; onClose: () => void; view: ShiftView }) {
  // The dashboard's period; only the grouping is chosen here.
  const r = useDrillRange(['selection'], 'selection');
  const url = open && r.dates ? rangeUrl('/api/hsm/plan', r.dates) : null;
  const { data, dataUrl, loading, error } = useApi<PlanReport>(url);

  return (
    <DrillDrawer
      open={open}
      onClose={onClose}
      title={view === 'day' ? 'Production · whole day · plan vs actual' : 'Production by shift · plan vs actual'}
      sub="HSM · MT"
      controls={r.controls}
      loading={loading}
      stale={!!data && dataUrl !== url}
      error={error}
      hasData={!!data}
    >
      {data && (view === 'day' ? <DayContent data={data} grain={r.grain} /> : <Content data={data} grain={r.grain} />)}
    </DrillDrawer>
  );
}

function Content({ data, grain }: { data: PlanReport; grain: Grain }) {
  const t = data.totals;
  const planned = t.plannedDays > 0;
  const rows = useMemo(() => shiftPeriods(data.days, grain), [data.days, grain]);
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => SHIFTS.flatMap((s) => [
    { id: `${s}-out`, name: `${s} output`, token: TOKENS[s].out, type: 'column' as const, data: rows.map((x) => x.out[s]), dp: 1 },
    { id: `${s}-plan`, name: `${s} target`, token: TOKENS[s].plan, type: 'line' as const, dashed: true, data: rows.map((x) => x.plan[s]), dp: 1 },
  ]), [rows]);
  const axes = useMemo(() => [{ title: 'MT', unit: 'MT' }], []);

  return (
    <>
      <Stats items={[
        ...SHIFTS.map((s) => ({
          label: s,
          value: f(t.actualByShift[s] ?? 0),
          unit: planned ? `MT · target ${f(t.byShift[s] ?? 0)}` : 'MT · no plan',
        })),
        { label: 'Plan gap', value: g(t.gapMt), unit: planned && t.plannedDays < t.days ? `MT · over ${t.plannedDays} of ${t.days} days` : 'MT', tone: gapTone(t.gapMt) },
      ]} />

      <DrillChart
        series={series}
        categories={categories}
        axes={axes}
        ariaLabel={`Production by shift: ${rows.map((x) => `${x.label} Day ${f(x.out.Day)} of ${f(x.plan.Day)}, Night ${f(x.out.Night)} of ${f(x.plan.Night)}`).join('; ')}`}
      />

      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Production by shift by period">
          <thead>
            <tr>
              <th>Period</th>
              {SHIFTS.map((s) => [
                <th key={`${s}-o`} className="r">{s} output</th>,
                <th key={`${s}-p`} className="r">{s} target</th>,
              ])}
              <th className="r">Plan gap</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.key}>
                <td><b>{x.label}</b>{x.fromDate !== x.toDate && <span className="pd-dim"> · {dm(x.fromDate)}–{dm(x.toDate)}</span>}</td>
                {SHIFTS.map((s) => [
                  <td key={`${s}-o`} className="num r v-val">{f(x.out[s])}</td>,
                  <td key={`${s}-p`} className="num r">{f(x.plan[s])}</td>,
                ])}
                <td className={`num r ${gapTone(x.gap)}`}>{g(x.gap)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              {SHIFTS.map((s) => [
                <td key={`${s}-o`} className="num r">{f(t.actualByShift[s] ?? 0)}</td>,
                <td key={`${s}-p`} className="num r">{planned ? f(t.byShift[s] ?? 0) : '—'}</td>,
              ])}
              <td className={`num r ${gapTone(t.gapMt)}`}>{g(t.gapMt)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <SourceBox sources={SOURCES} formula={FORMULA} />
    </>
  );
}

const pct = (v: number | null) => (v === null ? 'NA' : `${fmtNum(v, 1)}%`);
const compTone = (v: number | null) => (v === null ? 'v-na' : v >= 100 ? 'v-ok' : 'v-warn');

/** Whole day: all shifts together against the day's plan, with compliance. */
function DayContent({ data, grain }: { data: PlanReport; grain: Grain }) {
  const t = data.totals;
  const planned = t.plannedDays > 0;
  const rows = useMemo(() => shiftPeriods(data.days, grain), [data.days, grain]);
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'out', name: 'Output', token: '--s-prod', type: 'column', data: rows.map((x) => x.all.out), dp: 1 },
    { id: 'plan', name: 'Target', token: '--gold', type: 'line', dashed: true, data: rows.map((x) => x.all.plan), dp: 1 },
  ], [rows]);
  const axes = useMemo(() => [{ title: 'MT', unit: 'MT' }], []);
  const totalOut = Object.values(t.actualByShift).reduce((a, v) => a + v, 0);
  const compliance = planned && t.planMt && t.actualMt !== null ? (t.actualMt / t.planMt) * 100 : null;

  return (
    <>
      <Stats items={[
        { label: 'Output', value: f(totalOut), unit: planned ? `MT · target ${f(t.planMt)}` : 'MT · no plan' },
        { label: 'Compliance', value: pct(compliance), unit: planned && t.plannedDays < t.days ? `over ${t.plannedDays} of ${t.days} days` : '', tone: compTone(compliance) },
        { label: 'Plan gap', value: g(t.gapMt), unit: 'MT', tone: gapTone(t.gapMt) },
      ]} />

      <DrillChart
        series={series}
        categories={categories}
        axes={axes}
        ariaLabel={`Whole-day production: ${rows.map((x) => `${x.label} ${f(x.all.out)} of ${f(x.all.plan)}`).join('; ')}`}
      />

      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Whole-day production by period">
          <thead><tr><th>Period</th><th className="r">Output</th><th className="r">Target</th><th className="r">Compliance</th><th className="r">Plan gap</th></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.key}>
                <td><b>{x.label}</b>{x.fromDate !== x.toDate && <span className="pd-dim"> · {dm(x.fromDate)}–{dm(x.toDate)}</span>}</td>
                <td className="num r v-val">{f(x.all.out)}</td>
                <td className="num r">{f(x.all.plan)}</td>
                <td className={`num r ${compTone(x.all.compliance)}`}>{pct(x.all.compliance)}</td>
                <td className={`num r ${gapTone(x.gap)}`}>{g(x.gap)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="num r">{f(totalOut)}</td>
              <td className="num r">{planned ? f(t.planMt) : '—'}</td>
              <td className={`num r ${compTone(compliance)}`}>{pct(compliance)}</td>
              <td className={`num r ${gapTone(t.gapMt)}`}>{g(t.gapMt)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <SourceBox sources={SOURCES} formula={DAY_FORMULA} />
    </>
  );
}

const SOURCES: SourceSystem[] = [
  {
    name: 'Influx',
    rows: [
      ['Tag', 'Total_Production_Ton'],
      ['Filter', "_measurement = 'HSM', Unit = 'Finishing Mill', Group = 'General'"],
    ],
  },
  {
    name: 'Plan',
    rows: [
      ['File', 'Daily_Rolling_Tracker_Oct2026.xlsx, sheet Daily Log'],
      ['Field', 'target MT per date and shift, as written'],
    ],
  },
];

const FORMULA = [
  'Day = 08:00 IST → 20:00 IST, Night = 20:00 IST → 08:00 IST',
  "Shift output = counter increases in the shift's window, scaled so Day + Night = the day's production",
  'Plan gap = production − plan  (days the plan covers); + = ahead of plan, no sign = short',
];

const DAY_FORMULA = [
  'Output = Σ counter increases over the day (08:00 IST → 08:00 IST), all shifts',
  'Compliance = production ÷ plan × 100  (days the plan covers)',
  'Plan gap = production − plan  (days the plan covers); + = ahead of plan, no sign = short',
];
