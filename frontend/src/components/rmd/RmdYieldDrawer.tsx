'use client';

/**
 * RMD mass yield drill-down. Yield = ERP finished production ÷ billet input; the ERP side is
 * on hold, so this shows the part that is wired — billets in from the Influx counters, per
 * line (M1, M2), per day / week / month over the dashboard's period — and says the rest is
 * pending in its formula, not in notes.
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox, { type SourceSystem } from '@/components/drill/SourceBox';
import { useDrillRange } from '@/components/drill/useDrillRange';
import { dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmdBilletPeriod, type RmdBilletsReport } from '@/services/hsmApi';

const n = (v: number | null) => (v === null ? '—' : fmtNum(v, 0));

/** 'yield' from the Mass yield card (with the pending ERP side); 'infeed' from the mill flow (billets only). */
export type BilletsView = 'yield' | 'infeed';

export default function RmdYieldDrawer({ open, onClose, view = 'yield' }: { open: boolean; onClose: () => void; view?: BilletsView }) {
  // The dashboard's period; only the grouping is chosen here.
  const r = useDrillRange(['selection'], 'selection');
  const url = open && r.dates ? rangeUrl('/api/rmd/billets', { ...r.dates, grain: r.grain }) : null;
  const { data, dataUrl, loading, error } = useApi<RmdBilletsReport>(url);

  return (
    <DrillDrawer
      open={open}
      onClose={onClose}
      title={view === 'yield' ? 'Mass yield · billets in' : 'Billet infeed · Influx'}
      sub="RMD · pcs"
      controls={r.controls}
      loading={loading}
      stale={!!data && dataUrl !== url}
      error={error}
      hasData={!!data}
    >
      {data && <Content data={data} view={view} />}
    </DrillDrawer>
  );
}

function Content({ data, view }: { data: RmdBilletsReport; view: BilletsView }) {
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'm1', name: 'Line 1 (M1)', token: '--s-prod', type: 'column', stack: 'in', data: rows.map((x) => x.m1), dp: 0 },
    { id: 'm2', name: 'Line 2 (M2)', token: '--s-order', type: 'column', stack: 'in', data: rows.map((x) => x.m2), dp: 0 },
  ], [rows]);
  const axes = useMemo(() => [{ title: 'Billets', unit: 'pcs' }], []);

  return (
    <>
      <Stats items={[
        ...(view === 'yield' ? [{ label: 'Mass yield', value: 'NA', unit: 'billet input MT pending', tone: 'v-na' }] : []),
        { label: 'Billets in', value: n(t.totalPcs), unit: 'pcs' },
        { label: 'Line 1 (M1)', value: n(t.m1), unit: 'pcs' },
        { label: 'Line 2 (M2)', value: n(t.m2), unit: 'pcs' },
      ]} />

      <DrillChart
        series={series}
        categories={categories}
        axes={axes}
        ariaLabel={`Billets in by period: ${rows.map((x) => `${x.label} ${n(x.totalPcs)}`).join('; ')}`}
      />

      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Billets in by period">
          <thead><tr><th>Period</th><th className="r">Line 1 (M1)</th><th className="r">Line 2 (M2)</th><th className="r">Billets in</th></tr></thead>
          <tbody>{rows.map((x) => <Row key={x.key} r={x} />)}</tbody>
          <tfoot><Row r={t} /></tfoot>
        </table>
      </div>

      <SourceBox sources={view === 'yield' ? SOURCES : SOURCES.slice(0, 1)} formula={view === 'yield' ? FORMULA : FORMULA.slice(1)} />
      {data.influx.connection === 'down' && <p className="v-warn">{data.influx.message}</p>}
    </>
  );
}

function Row({ r }: { r: RmdBilletPeriod }) {
  const range = r.days > 1 && r.key !== 'total';
  return (
    <tr>
      <td><b>{r.label}</b>{range && <span className="pd-dim"> · {dm(r.fromDate)}–{dm(r.toDate)}</span>}</td>
      <td className="num r">{n(r.m1)}</td>
      <td className="num r">{n(r.m2)}</td>
      <td className="num r v-val"><b>{n(r.totalPcs)}</b></td>
    </tr>
  );
}

const SOURCES: SourceSystem[] = [
  {
    name: 'Influx',
    rows: [
      ['Tag', 'BILLET_COUNT'],
      ['Filter', "_measurement = 'TMT-RMD', Unit = 'CR Mill1/2', Group = 'M1', 'M2'"],
    ],
  },
  {
    name: 'ERP',
    rows: [
      ['Table', 'ATTR_TRAN_DATA_BODY'],
      ['Filter', "USER_CODE = 'FA-SKJ'"],
      ['Field', "ATTR_CODE = 'PRODUCT_PRIME_SLENGTH_MT' (value in ATTR_VALUE)"],
    ],
  },
];

const FORMULA = [
  'Mass yield = finished production (ERP) ÷ billet input (MT) × 100   (billet input MT pending)',
  'Billets in = Σ BILLET_COUNT increases per day (08:00 IST → 08:00 IST), M1 + M2',
];
