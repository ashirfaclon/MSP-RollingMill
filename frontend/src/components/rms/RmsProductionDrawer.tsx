'use client';

/**
 * RMS production from the ERP Production Log Sheet (division RS, series L5P) — HSM's sheet and
 * field with RMS's division — for the dashboard's period, per day / week / month: production,
 * billets in, billet input (INPUT_MT1 + INPUT_MT2), mass yield and mass difference. A day entered
 * twice with identical figures counts once.
 */
import { useMemo } from 'react';
import { useLastEntry } from '@/services/lastEntry';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox from '@/components/drill/SourceBox';
import SectionsCell from '@/components/drill/SectionsCell';
import { useDrillRange } from '@/components/drill/useDrillRange';
import { dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmsProductionPeriod, type RmsProductionReport } from '@/services/hsmApi';

const f = (v: number | null) => (v === null ? '—' : fmtNum(v, 2));
const pcs = (v: number | null) => (v === null ? '—' : v.toLocaleString('en-IN'));
/** The five losses, as the balance shows them. */
const LOSSES = [['burningLossMt', 'Burning loss'], ['endCutMt', 'End cut'], ['missRollMt', 'Miss-roll'], ['coldMt', 'Cold'], ['rejectMt', 'Reject']] as const;
const pct = (v: number | null) => (v === null ? '—' : `${fmtNum(v, 1)}%`);
const pct2 = (v: number | null) => (v === null ? '—' : `${fmtNum(v, 2)} %`);

/** The Duration period's RMS production report (day grain) — shared by the card and Order allocation. */
export function useRmsProduction(dates: { from: string; to: string } | null) {
  const url = rangeUrl('/api/rms/production', dates ? { ...dates, grain: 'day' } : null);
  const s = useApi<RmsProductionReport>(url);
  const data = s.data && s.dataUrl === url ? s.data : null;
  /* No ERP entry in the period: the last day the log sheet has (the user, 30 Oct 2026). */
  const last = useLastEntry<RmsProductionReport>('/api/rms/production', !!data && data.erp.connection === 'up' && data.totals.entryDays === 0, data?.erp.lastDate, dates?.from, 'grain=day');
  return { data, error: s.error, last };
}

/** production: output, losses, sections; rolling: the on-line rolling % (the user, 25 Nov 2026). */
export default function RmsProductionDrawer({ open, onClose, view = 'production' }: { open: boolean; onClose: () => void; view?: 'production' | 'rolling' }) {
  const r = useDrillRange(['selection'], 'selection');
  const url = open && r.dates ? rangeUrl('/api/rms/production', { ...r.dates, grain: r.grain }) : null;
  const { data, dataUrl, loading, error } = useApi<RmsProductionReport>(url);
  return (
    <DrillDrawer open={open} onClose={onClose} title={view === 'rolling' ? 'Rolling in casting and delivery · ERP log sheet' : 'Production · ERP log sheet'}
      sub={view === 'rolling' ? 'RMS · % · Online' : 'RMS · MT'} controls={r.controls}
      loading={loading} stale={!!data && dataUrl !== url} error={error} hasData={!!data}>
      {data && (view === 'rolling' ? <RollingContent data={data} /> : <Content data={data} />)}
    </DrillDrawer>
  );
}

const label = (x: RmsProductionPeriod) => (
  <td><b>{x.label}</b>{x.days > 1 && x.key !== 'total' && <span className="pd-dim"> · {dm(x.fromDate)}–{dm(x.toDate)}</span>}</td>
);

/** Each period's on-line rolling %, the ERP's, with the billet input they are weighted by. */
function RollingContent({ data }: { data: RmsProductionReport }) {
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'casting', name: 'Rolling in casting', token: '--s-prod', type: 'line', data: rows.map((x) => x.rollingInCastingPct), dp: 2 },
    { id: 'delivery', name: 'Rolling in delivery', token: '--s-order', type: 'line', data: rows.map((x) => x.rollingInDeliveryPct), dp: 2 },
  ], [rows]);
  const axes = useMemo(() => [{ title: '%', unit: '%' }], []);
  return (
    <>
      <Stats items={[
        { label: 'Rolling in casting', value: pct2(t.rollingInCastingPct), unit: '' },
        { label: 'Rolling in delivery', value: pct2(t.rollingInDeliveryPct), unit: '' },
        { label: 'Billet input', value: f(t.billetInputMt), unit: 'MT' },
        { label: 'Days entered', value: String(t.entryDays), unit: `of ${t.days}` },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Rolling in casting and delivery by period: ${rows.map((x) => `${x.label} ${pct2(x.rollingInCastingPct)} / ${pct2(x.rollingInDeliveryPct)}`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Rolling in casting and delivery by period">
          <thead><tr><th>Period</th><th className="r">Rolling in casting</th><th className="r">Rolling in delivery</th><th className="r">Billet input (MT)</th></tr></thead>
          <tbody>{rows.map((x) => (
            <tr key={x.key}>{label(x)}<td className="num r v-val">{pct2(x.rollingInCastingPct)}</td><td className="num r v-val">{pct2(x.rollingInDeliveryPct)}</td><td className="num r">{f(x.billetInputMt)}</td></tr>
          ))}</tbody>
          <tfoot><tr>{label(t)}<td className="num r">{pct2(t.rollingInCastingPct)}</td><td className="num r">{pct2(t.rollingInDeliveryPct)}</td><td className="num r">{f(t.billetInputMt)}</td></tr></tfoot>
        </table>
      </div>
      <SourceBox
        sources={[{ name: 'ERP', rows: [
          ['Table', 'ATTR_TRAN_DATA_HEAD + ATTR_TRAN_DATA_BODY'],
          ['Filter', "TNATURE = 'PRLOG', DIV_CODE = 'RS', SERIES = 'L5P' — every entry TRAN_COLUMN_NAME1 = P11P (Online)"],
          ['Field', "ATTR_CODE = 'ROLLING_PERCENATGE_CASTING' (the ERP's spelling), 'ROLLING_PERCENTAGE_DELIVERY', 'INPUT_MT1', 'INPUT_MT2'"],
        ] }]}
        formula={[
          'Each entry: the ERP\'s figure — billet input ÷ TOTAL_CAST_QTY (casting), ÷ DELIVERY_QTY (delivery), × 100',
          'Several entries: their average weighted by billet input (INPUT_MT1 + INPUT_MT2)',
        ]}
      />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

function Content({ data }: { data: RmsProductionReport }) {
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'input', name: 'Billet input', token: '--s-free', type: 'column', data: rows.map((x) => x.billetInputMt), dp: 2 },
    { id: 'prod', name: 'Actual', token: '--s-prod', type: 'column', data: rows.map((x) => x.productionMt), dp: 2 },
    { id: 'prime', name: 'Prime', token: '--s-order', type: 'column', data: rows.map((x) => x.primeMt), dp: 2 },
    { id: 'defective', name: 'Defective', token: '--violet', type: 'column', data: rows.map((x) => x.defectiveMt), dp: 2 },
    { id: 'yield', name: 'Mass yield', token: '--cat-5', type: 'line', axis: 1, data: rows.map((x) => x.massYieldPct), dp: 1 },
  ], [rows]);
  const axes = useMemo(() => [{ title: 'MT', unit: 'MT' }, { title: '%', unit: '%' }], []);
  return (
    <>
      <Stats items={[
        { label: 'Production (actual)', value: f(t.productionMt), unit: 'MT' },
        { label: 'Prime', value: f(t.primeMt), unit: 'MT' },
        { label: 'Defective', value: f(t.defectiveMt), unit: 'MT' },
        { label: 'Billet input', value: f(t.billetInputMt), unit: 'MT' },
        { label: 'Mass yield', value: pct(t.massYieldPct), unit: '' },
        { label: 'Prime yield', value: pct(t.primeYieldPct), unit: '' },
        { label: 'Mass difference', value: f(t.massDiffMt), unit: 'MT' },
        { label: 'Billets in', value: t.billetsPcs === null ? '—' : t.billetsPcs.toLocaleString('en-IN'), unit: 'pcs' },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Production by period: ${rows.map((x) => `${x.label} ${f(x.productionMt)} MT`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Production by period">
          <thead><tr><th>Period</th><th className="r">Billets in (pcs)</th><th className="r">Billet input (MT)</th><th className="r">Actual (MT)</th><th className="r">Prime (MT)</th><th className="r">Defective (MT)</th><th className="r">Mass yield</th><th className="r">Prime yield</th><th className="r">Mass difference (MT)</th></tr></thead>
          <tbody>{rows.map((x) => (
            <tr key={x.key}>{label(x)}<td className="num r">{pcs(x.billetsPcs)}</td><td className="num r">{f(x.billetInputMt)}</td><td className="num r v-val">{f(x.productionMt)}</td><td className="num r">{f(x.primeMt)}</td><td className="num r">{f(x.defectiveMt)}</td><td className="num r">{pct(x.massYieldPct)}</td><td className="num r">{pct(x.primeYieldPct)}</td><td className="num r">{f(x.massDiffMt)}</td></tr>
          ))}</tbody>
          <tfoot><tr>{label(t)}<td className="num r">{pcs(t.billetsPcs)}</td><td className="num r">{f(t.billetInputMt)}</td><td className="num r">{f(t.productionMt)}</td><td className="num r">{f(t.primeMt)}</td><td className="num r">{f(t.defectiveMt)}</td><td className="num r">{pct(t.massYieldPct)}</td><td className="num r">{pct(t.primeYieldPct)}</td><td className="num r">{f(t.massDiffMt)}</td></tr></tfoot>
        </table>
      </div>
      {/* What was rolled — its own table, so the one above keeps its width (the user, 25 Nov 2026). */}
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Section rolled by period">
          <thead><tr><th>Period</th><th className="r">Production (MT)</th><th>Section rolled</th></tr></thead>
          <tbody>{rows.map((x) => <tr key={x.key}>{label(x)}<td className="num r v-val">{f(x.productionMt)}</td><SectionsCell sections={x.sections} /></tr>)}</tbody>
          <tfoot><tr>{label(t)}<td className="num r">{f(t.productionMt)}</td><SectionsCell sections={t.sections} /></tr></tfoot>
        </table>
      </div>
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Losses by period">
          <thead><tr><th>Period</th>{LOSSES.map(([, l]) => <th key={l} className="r">{l}</th>)}<th className="r">Losses (MT)</th></tr></thead>
          <tbody>{rows.map((x) => (
            <tr key={x.key}>{label(x)}{LOSSES.map(([k]) => <td key={k} className="num r">{f(x[k])}</td>)}<td className="num r v-val">{f(x.lossesMt)}</td></tr>
          ))}</tbody>
          <tfoot><tr>{label(t)}{LOSSES.map(([k]) => <td key={k} className="num r">{f(t[k])}</td>)}<td className="num r">{f(t.lossesMt)}</td></tr></tfoot>
        </table>
      </div>
      <SourceBox
        sources={[{ name: 'ERP', rows: [
          ['Table', 'ATTR_TRAN_DATA_HEAD + ATTR_TRAN_DATA_BODY'],
          ['Filter', "ENTITY_CODE = 'MP', DIV_CODE = 'RS', TNATURE = 'PRLOG', SERIES = 'L5P'"],
          ['Field', "ATTR_CODE = 'PRODUCTION_MT', 'INPUT_MT1', 'INPUT_MT2', 'INPUT_PCS', 'BURNING_LOSS_MT1/2', 'ENDCUT_MT1/2', 'MISROLL_MT1/2', 'COLD_MT', 'REJECT_MT1/2' (value in ATTR_VALUE), by VRDATE"],
        ] }, { name: 'ERP', rows: [
          ['Table', 'PROD_TRAN (production receipts), ITEM_MAST (item name)'],
          ['Filter', "DIV_CODE = 'RS', finished items (ITEM_CODE 'F…'), not cancelled; defective counted in its section"],
          ['Size', 'read from the item name, as in Finished stock by size'],
        ] }]}
        formula={[
          "Actual production = Σ PRODUCTION_MT of the date's entries (prime + defective cut + rolling defect)",
          'Prime = Σ (PRIME_MT1 + PRIME_MT2);  Defective = Σ (DEFECTIVE_CUTMT1/2 + ROLLING_DEFECT_MT1/2) — each entry fills the …1 or the …2 fields',
          'Billet input = Σ (INPUT_MT1 + INPUT_MT2)',
          'Mass yield = production ÷ billet input × 100;  mass difference = billet input − production',
          'Prime yield = Σ prime ÷ Σ billet input × 100, over the entries with prime filled',
          'Losses = burning loss + end cut + miss-roll + cold + reject (= mass difference); …_MT1 + …_MT2 where split',
          'An entry repeating another of its date (same PRODUCTION_MT and PRODUCTION_PCS) counts once',
        ]}
      />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}
