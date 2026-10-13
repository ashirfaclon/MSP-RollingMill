'use client';

/**
 * LSM production from the ERP Production Log Sheet (USER_CODE = 'FA-LP-P'), for the dashboard's
 * period, per day / week / month. Two views of the same data:
 *   production  production per period (Production card, Order allocation);
 *   balance     production and the five losses (Material balance).
 * Codes exactly as the plant gave them; production is PRODUTION_MT, as the table spells it.
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox, { type SourceSystem } from '@/components/drill/SourceBox';
import { useDrillRange } from '@/components/drill/useDrillRange';
import { dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type LsmProductionPeriod, type LsmProductionReport } from '@/services/hsmApi';

export type LsmProductionView = 'production' | 'balance';

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
      title={view === 'production' ? 'Production · ERP log sheet' : 'Material balance · ERP log sheet'}
      sub="LSM · MT"
      controls={r.controls}
      loading={loading}
      stale={!!data && dataUrl !== url}
      error={error}
      hasData={!!data}
    >
      {data && (view === 'production' ? <ProductionContent data={data} /> : <BalanceContent data={data} />)}
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

const LOSS_COLS: { key: 'burningLossMt' | 'endCutMt' | 'missRollMt' | 'coldMt' | 'rejectMt'; name: string; token: string }[] = [
  { key: 'burningLossMt', name: 'Burning loss', token: '--s-pred' },
  { key: 'endCutMt', name: 'End cut', token: '--s-alt' },
  { key: 'missRollMt', name: 'Miss-roll', token: '--violet' },
  { key: 'coldMt', name: 'Cold', token: '--s-order' },
  { key: 'rejectMt', name: 'Reject', token: '--risk' },
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
        { label: 'Finished', value: f(t.productionMt), unit: 'MT' },
        { label: 'Losses', value: f(t.lossesMt), unit: 'MT' },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Losses by period: ${rows.map((x) => `${x.label} ${f(x.lossesMt)} MT`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Material balance by period">
          <thead><tr><th>Period</th><th className="r">Finished</th>{cols.map((c) => <th key={c.key} className="r">{c.name}</th>)}<th className="r">Losses</th></tr></thead>
          <tbody>{rows.map((x) => <BalanceRow key={x.key} x={x} cols={cols} />)}</tbody>
          <tfoot><BalanceRow x={t} cols={cols} /></tfoot>
        </table>
      </div>
      <SourceBox
        sources={sources(['PRODUTION_MT', 'B_LOSS_MT', 'ENDCUT_MT', 'MISROLL_MT', 'COLD_MT', 'REJECT_MT'])}
        formula={['Losses = B_LOSS_MT + ENDCUT_MT + MISROLL_MT + COLD_MT + REJECT_MT']}
      />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

function BalanceRow({ x, cols }: { x: LsmProductionPeriod; cols: typeof LOSS_COLS }) {
  return (
    <tr>
      {label(x)}
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
