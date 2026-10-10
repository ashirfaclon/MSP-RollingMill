'use client';

/**
 * RMD production from the ERP Production Log Sheet, for the dashboard's period, per day /
 * week / month. Two views of the same data:
 *   production  production per period (Production card, Finished exit, Order allocation);
 *   balance     production and where the rest went — the four losses (Material balance).
 * Source, filters and codes exactly as the plant gave them (USER_CODE = 'FA-SKJ').
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox, { type SourceSystem } from '@/components/drill/SourceBox';
import { useDrillRange } from '@/components/drill/useDrillRange';
import { dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmdProductionPeriod, type RmdProductionReport } from '@/services/hsmApi';

export type RmdProductionView = 'production' | 'balance';

const f = (v: number | null) => (v === null ? '—' : fmtNum(v, 2));

/** The Duration period's RMD production report (day grain) — shared by the cards and panels. */
export function useRmdProduction(dates: { from: string; to: string } | null) {
  const url = rangeUrl('/api/rmd/production', dates ? { ...dates, grain: 'day' } : null);
  const s = useApi<RmdProductionReport>(url);
  return { data: s.data && s.dataUrl === url ? s.data : null, error: s.error };
}

export default function RmdProductionDrawer({ open, onClose, view }: { open: boolean; onClose: () => void; view: RmdProductionView }) {
  const r = useDrillRange(['selection'], 'selection');
  const url = open && r.dates ? rangeUrl('/api/rmd/production', { ...r.dates, grain: r.grain }) : null;
  const { data, dataUrl, loading, error } = useApi<RmdProductionReport>(url);
  return (
    <DrillDrawer
      open={open}
      onClose={onClose}
      title={view === 'production' ? 'Production · ERP log sheet' : 'Material balance · ERP log sheet'}
      sub="RMD · MT"
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

const label = (x: RmdProductionPeriod) => (
  <td><b>{x.label}</b>{x.days > 1 && x.key !== 'total' && <span className="pd-dim"> · {dm(x.fromDate)}–{dm(x.toDate)}</span>}</td>
);

function ProductionContent({ data }: { data: RmdProductionReport }) {
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
        { label: 'Days entered', value: String(t.entryDays), unit: `of ${t.days} · to ${dm(data.erp.lastDate)}` },
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
      <SourceBox sources={sources(['PRODUCT_PRIME_SLENGTH_MT'])} formula={["Production = Σ PRODUCT_PRIME_SLENGTH_MT of the date's entries"]} />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

function BalanceContent({ data }: { data: RmdProductionReport }) {
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => {
    const col = (id: string, name: string, token: string, pick: (x: RmdProductionPeriod) => number | null): DrillSeries =>
      ({ id, name, token, type: 'column', stack: 'loss', data: rows.map(pick), dp: 2 });
    return [
      col('bloss', 'Burning loss', '--s-pred', (x) => x.burningLossMt),
      col('endcut', 'End cut', '--s-alt', (x) => x.endCutMt),
      col('missroll', 'Miss-roll', '--violet', (x) => x.missRollMt),
      col('chipoff', 'Chip off', '--risk', (x) => x.chipOffMt),
    ];
  }, [rows]);
  const axes = useMemo(() => [{ title: 'MT', unit: 'MT' }], []);

  return (
    <>
      <Stats items={[
        { label: 'Finished', value: f(t.productionMt), unit: 'MT' },
        { label: 'Losses', value: f(t.lossesMt), unit: 'MT' },
        { label: 'Billet input', value: 'NA', unit: 'MT · pending', tone: 'v-na' },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Losses by period: ${rows.map((x) => `${x.label} ${f(x.lossesMt)} MT`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Material balance by period">
          <thead><tr><th>Period</th><th className="r">Finished</th><th className="r">Burning loss</th><th className="r">End cut</th><th className="r">Miss-roll</th><th className="r">Chip off</th><th className="r">Losses</th></tr></thead>
          <tbody>{rows.map((x) => <BalanceRow key={x.key} x={x} />)}</tbody>
          <tfoot><BalanceRow x={t} /></tfoot>
        </table>
      </div>
      <SourceBox
        sources={sources(['PRODUCT_PRIME_SLENGTH_MT', 'BLOSS_MT', 'ENDCUT_MT', 'MISROLL_MT', 'CHIP_OFF_MT'])}
        formula={[
          'Losses = BLOSS_MT + ENDCUT_MT + MISROLL_MT + CHIP_OFF_MT',
          'Mass difference = billet input − finished   (billet input MT pending)',
          'Mass yield = finished ÷ billet input × 100   (billet input MT pending)',
        ]}
      />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

function BalanceRow({ x }: { x: RmdProductionPeriod }) {
  return (
    <tr>
      {label(x)}
      <td className="num r v-val">{f(x.productionMt)}</td>
      <td className="num r">{f(x.burningLossMt)}</td>
      <td className="num r">{f(x.endCutMt)}</td>
      <td className="num r">{f(x.missRollMt)}</td>
      <td className="num r">{f(x.chipOffMt)}</td>
      <td className="num r v-val"><b>{f(x.lossesMt)}</b></td>
    </tr>
  );
}

const sources = (codes: string[]): SourceSystem[] => [{
  name: 'ERP',
  rows: [
    ['Table', 'ATTR_TRAN_DATA_BODY'],
    ['Filter', "USER_CODE = 'FA-SKJ'"],
    ['Field', `ATTR_CODE = ${codes.map((c) => `'${c}'`).join(', ')} (value in ATTR_VALUE)`],
    ['Date', 'VRDATE — a date with two entries adds both'],
  ],
}];
