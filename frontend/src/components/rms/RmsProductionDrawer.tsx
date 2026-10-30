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
import { useDrillRange } from '@/components/drill/useDrillRange';
import { dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmsProductionPeriod, type RmsProductionReport } from '@/services/hsmApi';

const f = (v: number | null) => (v === null ? '—' : fmtNum(v, 2));
const pcs = (v: number | null) => (v === null ? '—' : v.toLocaleString('en-IN'));
/** The five losses, as the balance shows them. */
const LOSSES = [['burningLossMt', 'Burning loss'], ['endCutMt', 'End cut'], ['missRollMt', 'Miss-roll'], ['coldMt', 'Cold'], ['rejectMt', 'Reject']] as const;
const pct = (v: number | null) => (v === null ? '—' : `${fmtNum(v, 1)}%`);

/** The Duration period's RMS production report (day grain) — shared by the card and Order allocation. */
export function useRmsProduction(dates: { from: string; to: string } | null) {
  const url = rangeUrl('/api/rms/production', dates ? { ...dates, grain: 'day' } : null);
  const s = useApi<RmsProductionReport>(url);
  const data = s.data && s.dataUrl === url ? s.data : null;
  /* No ERP entry in the period: the last day the log sheet has (the user, 30 Oct 2026). */
  const last = useLastEntry<RmsProductionReport>('/api/rms/production', !!data && data.erp.connection === 'up' && data.totals.entryDays === 0, data?.erp.lastDate, dates?.from, 'grain=day');
  return { data, error: s.error, last };
}

export default function RmsProductionDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const r = useDrillRange(['selection'], 'selection');
  const url = open && r.dates ? rangeUrl('/api/rms/production', { ...r.dates, grain: r.grain }) : null;
  const { data, dataUrl, loading, error } = useApi<RmsProductionReport>(url);
  return (
    <DrillDrawer open={open} onClose={onClose} title="Production · ERP log sheet" sub="RMS · MT" controls={r.controls}
      loading={loading} stale={!!data && dataUrl !== url} error={error} hasData={!!data}>
      {data && <Content data={data} />}
    </DrillDrawer>
  );
}

const label = (x: RmsProductionPeriod) => (
  <td><b>{x.label}</b>{x.days > 1 && x.key !== 'total' && <span className="pd-dim"> · {dm(x.fromDate)}–{dm(x.toDate)}</span>}</td>
);

function Content({ data }: { data: RmsProductionReport }) {
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'input', name: 'Billet input', token: '--s-free', type: 'column', data: rows.map((x) => x.billetInputMt), dp: 2 },
    { id: 'prod', name: 'Production', token: '--s-prod', type: 'column', data: rows.map((x) => x.productionMt), dp: 2 },
    { id: 'yield', name: 'Mass yield', token: '--s-order', type: 'line', axis: 1, data: rows.map((x) => x.massYieldPct), dp: 1 },
  ], [rows]);
  const axes = useMemo(() => [{ title: 'MT', unit: 'MT' }, { title: '%', unit: '%' }], []);
  return (
    <>
      <Stats items={[
        { label: 'Production', value: f(t.productionMt), unit: 'MT' },
        { label: 'Billet input', value: f(t.billetInputMt), unit: 'MT' },
        { label: 'Mass yield', value: pct(t.massYieldPct), unit: '' },
        { label: 'Mass difference', value: f(t.massDiffMt), unit: 'MT' },
        { label: 'Billets in', value: t.billetsPcs === null ? '—' : t.billetsPcs.toLocaleString('en-IN'), unit: 'pcs' },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Production by period: ${rows.map((x) => `${x.label} ${f(x.productionMt)} MT`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Production by period">
          <thead><tr><th>Period</th><th className="r">Billets in (pcs)</th><th className="r">Billet input (MT)</th><th className="r">Production (MT)</th><th className="r">Mass yield</th><th className="r">Mass difference (MT)</th></tr></thead>
          <tbody>{rows.map((x) => (
            <tr key={x.key}>{label(x)}<td className="num r">{pcs(x.billetsPcs)}</td><td className="num r">{f(x.billetInputMt)}</td><td className="num r v-val">{f(x.productionMt)}</td><td className="num r">{pct(x.massYieldPct)}</td><td className="num r">{f(x.massDiffMt)}</td></tr>
          ))}</tbody>
          <tfoot><tr>{label(t)}<td className="num r">{pcs(t.billetsPcs)}</td><td className="num r">{f(t.billetInputMt)}</td><td className="num r">{f(t.productionMt)}</td><td className="num r">{pct(t.massYieldPct)}</td><td className="num r">{f(t.massDiffMt)}</td></tr></tfoot>
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
        ] }]}
        formula={[
          "Production = Σ PRODUCTION_MT of the date's entries",
          'Billet input = Σ (INPUT_MT1 + INPUT_MT2)',
          'Mass yield = production ÷ billet input × 100;  mass difference = billet input − production',
          'Losses = burning loss + end cut + miss-roll + cold + reject (= mass difference); …_MT1 + …_MT2 where split',
          'An entry repeating another of its date (same PRODUCTION_MT and PRODUCTION_PCS) counts once',
        ]}
      />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}
