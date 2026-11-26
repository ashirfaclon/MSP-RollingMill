'use client';

/**
 * LSM production from the ERP Production Log Sheet (USER_CODE = 'FA-LP-P'), for the dashboard's
 * period, per day / week / month. Four views of the same data:
 *   production  production per period (Production card, Order allocation);
 *   yield       prime yield = production ÷ billet input (INPUT_MT), and yield with non-prime =
 *               TOTAL_PRODUCTION ÷ INPUT_MT (the two yield cards);
 *   balance     billet input, production and the six losses (Material balance);
 *   availabilityPct … rollingInDeliveryPct  each of the plant's management KPIs on its own (the user, 23 /
 *               25 Nov 2026): its line against 100 %, beside the figures it is worked out from;
 *   breakdown   breakdown hours = DELAY_HRS, its own chart (the user, 25 Nov 2026);
 *   ccmBypassMt, lsmBypassMt  the two bypasses on their own, as HSM's (CCM_BY_PASS_MT, LSM_BY_PASS_MT; the user,
 *               25 Nov 2026 — LSM's log sheet has no defective figure, so that one is left out).
 * Codes exactly as the plant gave them; production is PRODUTION_MT, as the table spells it.
 */
import { useMemo } from 'react';
import { useLastEntry } from '@/services/lastEntry';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox, { type SourceSystem } from '@/components/drill/SourceBox';
import SectionsCell from '@/components/drill/SectionsCell';
import { useDrillRange } from '@/components/drill/useDrillRange';
import { dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type LsmProductionPeriod, type LsmProductionReport } from '@/services/hsmApi';

export type LsmProductionView = 'production' | 'yield' | 'balance' | 'breakdown' | BypassKey | PerfKey;

const TITLES: Record<LsmProductionView, string> = {
  production: 'Production · ERP log sheet',
  yield: 'Yield · ERP log sheet',
  balance: 'Material balance · ERP log sheet',
  breakdown: 'Breakdown · ERP log sheet',
  ccmBypassMt: 'CCM bypass · ERP log sheet',
  lsmBypassMt: 'LSM bypass · ERP log sheet',
  availabilityPct: 'Availability · ERP log sheet',
  performancePct: 'Performance · ERP log sheet',
  efficiencyPct: 'Efficiency · ERP log sheet',
  rollingInCastingPct: 'Rolling in casting · ERP log sheet',
  rollingInDeliveryPct: 'Rolling in delivery · ERP log sheet',
};

const f = (v: number | null) => (v === null ? '—' : fmtNum(v, 2));

/** The Duration period's LSM production report (day grain) — shared by the cards and panels. */
export function useLsmProduction(dates: { from: string; to: string } | null) {
  const url = rangeUrl('/api/lsm/production', dates ? { ...dates, grain: 'day' } : null);
  const s = useApi<LsmProductionReport>(url);
  const data = s.data && s.dataUrl === url ? s.data : null;
  /* No ERP entry in the period: the last day the log sheet has (the user, 30 Oct 2026). */
  const last = useLastEntry<LsmProductionReport>('/api/lsm/production', !!data && data.erp.connection === 'up' && data.totals.entryDays === 0, data?.erp.lastDate, dates?.from, 'grain=day');
  return { data, error: s.error, last };
}

export default function LsmProductionDrawer({ open, onClose, view }: { open: boolean; onClose: () => void; view: LsmProductionView }) {
  const r = useDrillRange(['selection'], 'selection');
  const url = open && r.dates ? rangeUrl('/api/lsm/production', { ...r.dates, grain: r.grain }) : null;
  const { data, dataUrl, loading, error } = useApi<LsmProductionReport>(url);
  return (
    <DrillDrawer
      open={open}
      onClose={onClose}
      title={TITLES[view]}
      sub={view === 'breakdown' ? 'LSM · hours' : view === 'yield' || view in PERF ? 'LSM · %' : 'LSM · MT'}
      controls={r.controls}
      loading={loading}
      stale={!!data && dataUrl !== url}
      error={error}
      hasData={!!data}
    >
      {data && (view === 'production' ? <ProductionContent data={data} /> : view === 'yield' ? <YieldContent data={data} />
        : view in PERF ? <KpiContent data={data} k={view as PerfKey} /> : view in BYPASS ? <BypassContent data={data} k={view as BypassKey} />
        : view === 'breakdown' ? <BreakdownContent data={data} /> : <BalanceContent data={data} />)}
    </DrillDrawer>
  );
}

const label = (x: LsmProductionPeriod) => (
  <td><b>{x.label}</b>{x.days > 1 && x.key !== 'total' && <span className="pd-dim"> · {dm(x.fromDate)}–{dm(x.toDate)}</span>}</td>
);

function ProductionContent({ data }: { data: LsmProductionReport }) {
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'prod', name: 'Production', token: '--s-prod', type: 'column', data: rows.map((x) => x.productionMt), dp: 2 },
  ], [rows]);
  const axes = useMemo(() => [{ title: 'MT', unit: 'MT' }], []);
  return (
    <>
      <Stats items={[
        { label: 'Production', value: f(t.productionMt), unit: 'MT' },
        { label: 'Days entered', value: String(t.entryDays), unit: `of ${t.days}` },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Production by period: ${rows.map((x) => `${x.label} ${f(x.productionMt)} MT`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Production by period">
          <thead><tr><th>Period</th><th className="r">Production (MT)</th><th>Section rolled</th></tr></thead>
          <tbody>{rows.map((x) => <tr key={x.key}>{label(x)}<td className="num r v-val">{f(x.productionMt)}</td><SectionsCell sections={x.sections} /></tr>)}</tbody>
          <tfoot><tr>{label(t)}<td className="num r">{f(t.productionMt)}</td><SectionsCell sections={t.sections} /></tr></tfoot>
        </table>
      </div>
      <SourceBox
        sources={[...sources(['PRODUTION_MT']), { name: 'ERP', rows: [
          ['Table', 'PROD_TRAN (production receipts), ITEM_MAST (item name)'],
          ['Filter', "DIV_CODE = 'LS', finished items (ITEM_CODE 'F…'), not cancelled, defective items left out"],
          ['Section', 'read from the item name, as in Finished stock by size (MS ANGLE 65X6 → A 65×65×6)'],
        ] }]}
        formula={["Production = Σ PRODUTION_MT of the date's entries", 'Section rolled = the finished items received that day, by section (MT each when more than one)']}
      />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

function YieldContent({ data }: { data: LsmProductionReport }) {
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'prime', name: 'Prime yield', token: '--s-order', type: 'line', data: rows.map((x) => x.massYieldPct), dp: 2 },
    { id: 'nonprime', name: 'Yield with non-prime', token: '--s-prod', type: 'line', data: rows.map((x) => x.nonPrimeYieldPct), dp: 2 },
  ], [rows]);
  const axes = useMemo(() => [{ title: '%', unit: '%' }], []);
  return (
    <>
      <Stats items={[
        { label: 'Prime yield', value: f(t.massYieldPct), unit: '%' },
        { label: 'Yield with non-prime', value: f(t.nonPrimeYieldPct), unit: '%' },
        { label: 'Billet input', value: f(t.billetInputMt), unit: 'MT' },
        { label: 'Production', value: f(t.productionMt), unit: 'MT' },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Yield by period: ${rows.map((x) => `${x.label} prime ${f(x.massYieldPct)}%, with non-prime ${f(x.nonPrimeYieldPct)}%`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Yield by period">
          <thead><tr><th>Period</th><th className="r">Billet input (MT)</th><th className="r">Production (MT)</th><th className="r">Prime yield (%)</th><th className="r">Production + short length (MT)</th><th className="r">Yield with non-prime (%)</th></tr></thead>
          <tbody>{rows.map((x) => <YieldRow key={x.key} x={x} />)}</tbody>
          <tfoot><YieldRow x={t} /></tfoot>
        </table>
      </div>
      <SourceBox sources={sources(['INPUT_MT', 'PRODUTION_MT', 'TOTAL_PRODUCTION'])} formula={[
        'Prime yield = PRODUTION_MT ÷ INPUT_MT × 100',
        'Yield with non-prime = TOTAL_PRODUCTION ÷ INPUT_MT × 100 (TOTAL_PRODUCTION = PRODUTION_MT + SHORTLENGTH_MT)',
      ]} />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

function YieldRow({ x }: { x: LsmProductionPeriod }) {
  return (
    <tr>
      {label(x)}
      <td className="num r">{f(x.billetInputMt)}</td>
      <td className="num r">{f(x.productionMt)}</td>
      <td className="num r v-val"><b>{f(x.massYieldPct)}</b></td>
      <td className="num r">{f(x.totalProductionMt)}</td>
      <td className="num r v-val"><b>{f(x.nonPrimeYieldPct)}</b></td>
    </tr>
  );
}

/** Breakdown on its own (the user, 25 Nov 2026): DELAY_HRS per period, beside the running hours. */
function BreakdownContent({ data }: { data: LsmProductionReport }) {
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'breakdown', name: 'Breakdown', token: '--risk', type: 'column', data: rows.map((x) => x.delayHrs), dp: 2 },
  ], [rows]);
  const axes = useMemo(() => [{ title: 'h', unit: 'h', min: 0 }], []);
  return (
    <>
      <Stats items={[
        { label: 'Breakdown', value: f(t.delayHrs), unit: 'h' },
        { label: 'Running', value: f(t.runningHrs), unit: 'h' },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Breakdown by period: ${rows.map((x) => `${x.label} ${f(x.delayHrs)} h`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Breakdown by period">
          <thead><tr><th>Period</th><th className="r">Breakdown (h)</th><th className="r">Running (h)</th></tr></thead>
          <tbody>{rows.map((x) => <BreakdownRow key={x.key} x={x} />)}</tbody>
          <tfoot><BreakdownRow x={t} /></tfoot>
        </table>
      </div>
      <SourceBox sources={sources(['DELAY_HRS', 'NET_RUNNING_HRS'])} formula={['Breakdown hours = Σ DELAY_HRS of the period\'s entries']} />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

function BreakdownRow({ x }: { x: LsmProductionPeriod }) {
  return (
    <tr>
      {label(x)}
      <td className="num r v-val"><b>{f(x.delayHrs)}</b></td>
      <td className="num r">{f(x.runningHrs)}</td>
    </tr>
  );
}

export type BypassKey = 'ccmBypassMt' | 'lsmBypassMt';

/** The two bypasses, as HSM's (the user, 25 Nov 2026): each read against the billet input, as the ERP's own % is. */
export const BYPASS: Record<BypassKey, { name: string; field: string; token: string }> = {
  ccmBypassMt: { name: 'CCM bypass', field: 'CCM_BY_PASS_MT', token: '--s-alt' },
  lsmBypassMt: { name: 'LSM bypass', field: 'LSM_BY_PASS_MT', token: '--violet' },
};

function BypassContent({ data, k }: { data: LsmProductionReport; k: BypassKey }) {
  const c = BYPASS[k];
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: k, name: c.name, token: c.token, type: 'column', data: rows.map((x) => x[k]), dp: 2 },
  ], [rows, k, c]);
  const axes = useMemo(() => [{ title: 'MT', unit: 'MT', min: 0 }], []);
  return (
    <>
      <Stats items={[
        { label: c.name, value: f(t[k]), unit: 'MT' },
        { label: 'Billet input', value: f(t.billetInputMt), unit: 'MT' },
        { label: 'Days entered', value: String(t.entryDays), unit: `of ${t.days}` },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`${c.name} by period: ${rows.map((x) => `${x.label} ${f(x[k])} MT`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label={`${c.name} by period`}>
          <thead><tr><th>Period</th><th className="r">{c.name} (MT)</th><th className="r">Billet input (MT)</th></tr></thead>
          <tbody>{rows.map((x) => <BypassRow key={x.key} x={x} k={k} />)}</tbody>
          <tfoot><BypassRow x={t} k={k} /></tfoot>
        </table>
      </div>
      <SourceBox sources={sources([c.field, 'INPUT_MT'])} formula={[`${c.name} = Σ ${c.field} of the period's entries`]} />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

function BypassRow({ x, k }: { x: LsmProductionPeriod; k: BypassKey }) {
  return (
    <tr>
      {label(x)}
      <td className="num r v-val"><b>{f(x[k])}</b></td>
      <td className="num r">{f(x.billetInputMt)}</td>
    </tr>
  );
}

export type PerfKey = 'availabilityPct' | 'performancePct' | 'efficiencyPct' | 'rollingInCastingPct' | 'rollingInDeliveryPct';
type Col = { key: keyof LsmProductionPeriod; name: string; unit: string };

/**
 * Each of the five on its own (the user, 25 Nov 2026 — no combined chart): its own line against 100 %, and
 * beside it in the table the figures it is worked out from.
 */
const PERF: Record<PerfKey, { name: string; token: string; cols: Col[]; codes: string[]; formula: string[] }> = {
  availabilityPct: {
    name: 'Availability', token: '--s-prod',
    cols: [{ key: 'runningHrs', name: 'Running', unit: 'h' }, { key: 'delayHrs', name: 'Breakdown', unit: 'h' }],
    codes: ['PLANT_AVAILABILITY', 'NET_RUNNING_HRS', 'DELAY_HRS'],
    formula: ['Availability = NET_RUNNING_HRS ÷ (NET_RUNNING_HRS + DELAY_HRS) × 100 — one entry: the ERP\'s PLANT_AVAILABILITY',
      'Several entries: weighted by running + delay hours'],
  },
  performancePct: {
    name: 'Performance', token: '--s-order',
    cols: [{ key: 'runningHrs', name: 'Running', unit: 'h' }],
    codes: ['PLANT_PERFORMANCE', 'NET_RUNNING_HRS'],
    formula: ['Performance = the ERP\'s PLANT_PERFORMANCE of each entry', 'Several entries: weighted by running hours'],
  },
  efficiencyPct: {
    name: 'Efficiency', token: '--s-pred',
    cols: [{ key: 'availabilityPct', name: 'Availability', unit: '%' }, { key: 'performancePct', name: 'Performance', unit: '%' }],
    codes: ['PLANT_EFFICIENCY', 'PLANT_AVAILABILITY', 'PLANT_PERFORMANCE', 'NET_RUNNING_HRS', 'DELAY_HRS'],
    formula: ['Efficiency = availability × performance — one entry: the ERP\'s PLANT_EFFICIENCY',
      'Several entries: weighted by running + delay hours'],
  },
  rollingInCastingPct: {
    name: 'Rolling in casting', token: '--s-alt',
    cols: [{ key: 'billetInputMt', name: 'Billet input', unit: 'MT' }],
    codes: ['ROLLING_PERCENTAGE_CASTING', 'INPUT_MT'],
    formula: ['Rolling in casting = Σ INPUT_MT ÷ Σ (INPUT_MT ÷ ROLLING_PERCENTAGE_CASTING) × 100'],
  },
  rollingInDeliveryPct: {
    name: 'Rolling in delivery', token: '--violet',
    cols: [{ key: 'billetInputMt', name: 'Billet input', unit: 'MT' }],
    codes: ['ROLLING_PERCENTAGE_DELIVERY', 'INPUT_MT'],
    formula: ['Rolling in delivery = Σ INPUT_MT ÷ Σ (INPUT_MT ÷ ROLLING_PERCENTAGE_DELIVERY) × 100'],
  },
};

const val = (x: LsmProductionPeriod, k: keyof LsmProductionPeriod) => {
  const v = x[k];
  return typeof v === 'number' ? v : null;
};

function KpiContent({ data, k }: { data: LsmProductionReport; k: PerfKey }) {
  const c = PERF[k];
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: k, name: c.name, token: c.token, type: 'line', data: rows.map((x) => x[k]), dp: 2 },
  ], [rows, k, c]);
  const axes = useMemo(() => [{ title: '%', unit: '%', line: { value: 100, label: '100 %' } }], []);
  return (
    <>
      <Stats items={[
        { label: c.name, value: f(t[k]), unit: '%' },
        ...c.cols.map((col) => ({ label: col.name, value: f(val(t, col.key)), unit: col.unit })),
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`${c.name} by period: ${rows.map((x) => `${x.label} ${f(x[k])}%`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label={`${c.name} by period`}>
          <thead><tr><th>Period</th><th className="r">{c.name} (%)</th>{c.cols.map((col) => <th key={col.key} className="r">{col.name} ({col.unit})</th>)}</tr></thead>
          <tbody>{rows.map((x) => <KpiRow key={x.key} x={x} k={k} />)}</tbody>
          <tfoot><KpiRow x={t} k={k} /></tfoot>
        </table>
      </div>
      <SourceBox sources={sources(c.codes)} formula={c.formula} />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

function KpiRow({ x, k }: { x: LsmProductionPeriod; k: PerfKey }) {
  return (
    <tr>
      {label(x)}
      <td className="num r v-val"><b>{f(x[k])}</b></td>
      {PERF[k].cols.map((col) => <td key={col.key} className="num r">{f(val(x, col.key))}</td>)}
    </tr>
  );
}

const LOSS_COLS: { key: 'burningLossMt' | 'endCutMt' | 'missRollMt' | 'coldMt' | 'rejectMt' | 'shortLengthMt'; name: string; token: string }[] = [
  { key: 'burningLossMt', name: 'Burning loss', token: '--s-pred' },
  { key: 'endCutMt', name: 'End cut', token: '--s-alt' },
  { key: 'missRollMt', name: 'Miss-roll', token: '--violet' },
  { key: 'coldMt', name: 'Cold', token: '--s-order' },
  { key: 'rejectMt', name: 'Reject', token: '--risk' },
  { key: 'shortLengthMt', name: 'Short length', token: '--gold' },
];

function BalanceContent({ data }: { data: LsmProductionReport }) {
  const rows = data.rows;
  const t = data.totals;
  // A loss that is 0 over the whole period isn't there: no series, no column.
  const cols = LOSS_COLS.filter((c) => (t[c.key] ?? 0) >= 0.005);
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => cols.map((c) => (
    { id: c.key, name: c.name, token: c.token, type: 'column', stack: 'loss', data: rows.map((x) => x[c.key]), dp: 2 }
  )), [rows, cols]);
  const axes = useMemo(() => [{ title: 'MT', unit: 'MT' }], []);
  return (
    <>
      <Stats items={[
        { label: 'Billet input', value: f(t.billetInputMt), unit: t.billetsPcs === null ? 'MT' : `MT · ${t.billetsPcs.toLocaleString('en-IN')} pcs` },
        { label: 'Finished', value: f(t.productionMt), unit: 'MT' },
        { label: 'Mass difference', value: f(t.massDiffMt), unit: 'MT' },
        { label: 'Losses', value: f(t.lossesMt), unit: 'MT' },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Losses by period: ${rows.map((x) => `${x.label} ${f(x.lossesMt)} MT`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Material balance by period">
          <thead><tr><th>Period</th><th className="r">Billets (pcs)</th><th className="r">Billet input</th><th className="r">Finished</th>{cols.map((c) => <th key={c.key} className="r">{c.name}</th>)}<th className="r">Losses</th></tr></thead>
          <tbody>{rows.map((x) => <BalanceRow key={x.key} x={x} cols={cols} />)}</tbody>
          <tfoot><BalanceRow x={t} cols={cols} /></tfoot>
        </table>
      </div>
      <SourceBox
        sources={sources(['INPUT_PCS', 'INPUT_MT', 'PRODUTION_MT', 'B_LOSS_MT', 'ENDCUT_MT', 'MISROLL_MT', 'COLD_MT', 'REJECT_MT', 'SHORTLENGTH_MT'])}
        formula={['Mass difference = INPUT_MT − PRODUTION_MT', 'Losses = B_LOSS_MT + ENDCUT_MT + MISROLL_MT + COLD_MT + REJECT_MT + SHORTLENGTH_MT']}
      />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

function BalanceRow({ x, cols }: { x: LsmProductionPeriod; cols: typeof LOSS_COLS }) {
  return (
    <tr>
      {label(x)}
      <td className="num r">{x.billetsPcs === null ? '—' : x.billetsPcs.toLocaleString('en-IN')}</td>
      <td className="num r">{f(x.billetInputMt)}</td>
      <td className="num r v-val">{f(x.productionMt)}</td>
      {cols.map((c) => <td key={c.key} className="num r">{f(x[c.key])}</td>)}
      <td className="num r v-val"><b>{f(x.lossesMt)}</b></td>
    </tr>
  );
}

const sources = (codes: string[]): SourceSystem[] => [{
  name: 'ERP',
  rows: [
    ['Table', 'ATTR_TRAN_DATA_BODY'],
    ['Filter', "USER_CODE = 'FA-LP-P' (division LS)"],
    ['Field', `ATTR_CODE = ${codes.map((c) => `'${c}'`).join(', ')} (value in ATTR_VALUE)`],
    ['Date', 'VRDATE — a date with two entries adds both'],
  ],
}];
