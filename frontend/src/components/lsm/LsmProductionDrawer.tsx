'use client';

/**
 * LSM production from the ERP Production Log Sheet (USER_CODE = 'FA-LP-P'), for the dashboard's
 * period, per day / week / month. Two views of the same data:
 *   production  production per period (Production card, Order allocation);
 *   yield       mass yield = production ÷ billet input (INPUT_MT) (Mass yield card);
 *   balance     billet input, production and the six losses (Material balance).
 * Codes exactly as the plant gave them; production is PRODUTION_MT, as the table spells it.
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox, { type SourceSystem } from '@/components/drill/SourceBox';
import { useDrillRange } from '@/components/drill/useDrillRange';
import { dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type LsmProductionPeriod, type LsmProductionReport } from '@/services/hsmApi';

export type LsmProductionView = 'production' | 'yield' | 'balance';

const f = (v: number | null) => (v === null ? '—' : fmtNum(v, 2));

/** The Duration period's LSM production report (day grain) — shared by the cards and panels. */
export function useLsmProduction(dates: { from: string; to: string } | null) {
  const url = rangeUrl('/api/lsm/production', dates ? { ...dates, grain: 'day' } : null);
  const s = useApi<LsmProductionReport>(url);
  return { data: s.data && s.dataUrl === url ? s.data : null, error: s.error };
}

export default function LsmProductionDrawer({ open, onClose, view }: { open: boolean; onClose: () => void; view: LsmProductionView }) {
  const r = useDrillRange(['selection'], 'selection');
  const url = open && r.dates ? rangeUrl('/api/lsm/production', { ...r.dates, grain: r.grain }) : null;
  const { data, dataUrl, loading, error } = useApi<LsmProductionReport>(url);
  return (
    <DrillDrawer
      open={open}
      onClose={onClose}
      title={view === 'production' ? 'Production · ERP log sheet' : view === 'yield' ? 'Mass yield · ERP log sheet' : 'Material balance · ERP log sheet'}
      sub={view === 'yield' ? 'LSM · %' : 'LSM · MT'}
      controls={r.controls}
      loading={loading}
      stale={!!data && dataUrl !== url}
      error={error}
      hasData={!!data}
    >
      {data && (view === 'production' ? <ProductionContent data={data} /> : view === 'yield' ? <YieldContent data={data} /> : <BalanceContent data={data} />)}
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
          <thead><tr><th>Period</th><th className="r">Production (MT)</th></tr></thead>
          <tbody>{rows.map((x) => <tr key={x.key}>{label(x)}<td className="num r v-val">{f(x.productionMt)}</td></tr>)}</tbody>
          <tfoot><tr>{label(t)}<td className="num r">{f(t.productionMt)}</td></tr></tfoot>
        </table>
      </div>
      <SourceBox sources={sources(['PRODUTION_MT'])} formula={["Production = Σ PRODUTION_MT of the date's entries"]} />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

function YieldContent({ data }: { data: LsmProductionReport }) {
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'yield', name: 'Mass yield', token: '--s-order', type: 'line', data: rows.map((x) => x.massYieldPct), dp: 2 },
  ], [rows]);
  const axes = useMemo(() => [{ title: '%', unit: '%' }], []);
  return (
    <>
      <Stats items={[
        { label: 'Mass yield', value: f(t.massYieldPct), unit: '%' },
        { label: 'Billet input', value: f(t.billetInputMt), unit: 'MT' },
        { label: 'Production', value: f(t.productionMt), unit: 'MT' },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Mass yield by period: ${rows.map((x) => `${x.label} ${f(x.massYieldPct)}%`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Mass yield by period">
          <thead><tr><th>Period</th><th className="r">Billet input (MT)</th><th className="r">Production (MT)</th><th className="r">Mass yield (%)</th></tr></thead>
          <tbody>{rows.map((x) => <YieldRow key={x.key} x={x} />)}</tbody>
          <tfoot><YieldRow x={t} /></tfoot>
        </table>
      </div>
      <SourceBox sources={sources(['INPUT_MT', 'PRODUTION_MT'])} formula={['Mass yield = PRODUTION_MT ÷ INPUT_MT × 100']} />
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
