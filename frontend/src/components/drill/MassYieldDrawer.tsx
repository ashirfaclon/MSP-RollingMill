'use client';

/**
 * Mass yield drill-down — output before rejection ÷ input, ERP beside Influx, for the
 * period chosen on the dashboard, per day / week / month: the two yields and their delta,
 * a chart of the two lines, a table of the same numbers, and where they come from.
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from './DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from './DrillChart';
import SourceBox, { type SourceSystem } from './SourceBox';
import { useDrillRange } from './useDrillRange';
import { dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type YieldComparison, type YieldPeriod } from '@/services/hsmApi';

/**
 * Influx − ERP, only where both cover every day of the row — an ERP day not entered yet,
 * or a day whose by-products are not booked, must not show up as a gap between the two.
 */
export const yieldDelta = (r: YieldPeriod) => (
  r.erpYieldPct !== null && r.netYieldPct !== null && r.erpDays === r.days && r.netDays === r.days
    ? r.netYieldPct - r.erpYieldPct
    : null
);

const f = (v: number | null) => fmtNum(v, 2);
const tone = (v: number | null) => (v === null ? 'v-na' : Math.abs(v) < 0.005 ? 'v-ok' : 'v-warn');

export default function MassYieldDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  // The same period as the dashboard, so the drawer's totals are the card's.
  const r = useDrillRange(['selection'], 'selection');
  const url = open && r.dates ? rangeUrl('/api/hsm/yield', { ...r.dates, grain: r.grain }) : null;
  const { data, dataUrl, loading, error } = useApi<YieldComparison>(url);

  return (
    <DrillDrawer
      open={open}
      onClose={onClose}
      title="Mass yield · ERP vs Influx"
      sub="HSM · %"
      controls={r.controls}
      loading={loading}
      stale={!!data && dataUrl !== url}
      error={error}
      hasData={!!data}
    >
      {data && <Content data={data} />}
    </DrillDrawer>
  );
}

function Content({ data }: { data: YieldComparison }) {
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'erp', name: 'ERP', token: '--s-prod', type: 'line', data: rows.map((x) => x.erpYieldPct), dp: 2 },
    { id: 'influx', name: 'Influx', token: '--s-order', type: 'line', data: rows.map((x) => x.netYieldPct), dp: 2 },
  ], [rows]);
  const axes = useMemo(() => [{ title: '%', unit: '%' }], []);
  const tooltip = useMemo(() => (i: number, visible: Set<string>) => {
    const x = rows[i];
    if (!x) return '';
    const lines = [`<b>${x.label}</b>`];
    if (visible.has('erp')) lines.push(`ERP: <b>${f(x.erpYieldPct)} %</b>`);
    if (visible.has('influx')) lines.push(`Influx: <b>${f(x.netYieldPct)} %</b>`);
    const d = yieldDelta(x);
    // The delta needs both lines.
    if (visible.has('erp') && visible.has('influx') && d !== null) lines.push(`Delta: <b>${f(d)} %</b>`);
    return lines.join('<br/>');
  }, [rows]);
  const delta = yieldDelta(t);

  return (
    <>
      <Stats items={[
        { label: 'ERP', value: f(t.erpYieldPct), unit: '%' },
        { label: 'Influx', value: f(t.netYieldPct), unit: '%' },
        { label: 'Delta', value: f(delta), unit: '%', tone: tone(delta) },
      ]} />

      <DrillChart
        series={series}
        categories={categories}
        axes={axes}
        tooltip={tooltip}
        ariaLabel={`Mass yield by period: ${rows.map((x) => `${x.label} ERP ${f(x.erpYieldPct)} %, Influx ${f(x.netYieldPct)} %`).join('; ')}`}
      />

      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Mass yield by period">
          <thead>
            <tr>
              <th>Period</th>
              <th className="r">ERP (%)</th>
              <th className="r">Influx (%)</th>
              <th className="r">Delta (%)</th>
            </tr>
          </thead>
          <tbody>{rows.map((x) => <Row key={x.key} r={x} />)}</tbody>
          <tfoot><Row r={t} /></tfoot>
        </table>
      </div>

      <SourceBox sources={SOURCES} formula={FORMULA} />
      {data.influx.unweighedBillets > 0 && (
        <p className="v-warn">{data.influx.unweighedBillets} billets had no billet size in Influx and are left out of the Influx input.</p>
      )}
      {(data.erp.connection === 'down' || data.influx.connection === 'down') && (
        <p className="v-warn">{data.erp.connection === 'down' ? data.erp.message : data.influx.message}</p>
      )}
    </>
  );
}

function Row({ r }: { r: YieldPeriod }) {
  const range = r.days > 1 && r.key !== 'total';
  const d = yieldDelta(r);
  return (
    <tr>
      <td><b>{r.label}</b>{range && <span className="pd-dim"> · {dm(r.fromDate)}–{dm(r.toDate)}</span>}</td>
      <td className="num r v-val">{f(r.erpYieldPct)}</td>
      <td className="num r v-val">{f(r.netYieldPct)}</td>
      <td className={`num r ${tone(d)}`}>{f(d)}</td>
    </tr>
  );
}

const SOURCES: SourceSystem[] = [
  {
    name: 'ERP',
    rows: [
      ['Table', 'ATTR_TRAN_DATA_HEAD + ATTR_TRAN_DATA_BODY'],
      ['Filter', "ENTITY_CODE = 'MP', DIV_CODE = 'S1', TNATURE = 'PRLOG', SERIES = 'L6P'"],
      ['Field', "ATTR_CODE = 'PRODUCTION_MT', 'INPUT_MT', summed per VRDATE"],
    ],
  },
  {
    name: 'Influx',
    rows: [
      ['Tag', 'Total_Production_Ton, Dicharged_Billet, Billet_Length_1_5_3M, Billet_Width_mm, Billet_Height_mm'],
      ['Filter', "_measurement = 'HSM', Unit = 'Finishing Mill', Group = 'General'"],
    ],
  },
  {
    name: 'ERP · by-products',
    rows: [
      ['Table', 'PROD_TRAN'],
      ['Filter', "ENTITY_CODE = 'MP', DIV_CODE = 'S1', ITEM_CODE IN ('C01010100093', 'C01010100033', 'C01010100016', 'C01010100032')"],
      ['Field', 'QTYRECD, summed per VRDATE'],
    ],
  },
];

const FORMULA = [
  'ERP yield = PRODUCTION_MT ÷ INPUT_MT × 100',
  'Influx yield = (Total_Production_Ton − by-products) ÷ Influx input × 100',
  'Influx input = Dicharged_Billet × Length × Width/1000 × Height/1000 × 7.832',
  'By-products = Mill Scale + Strip Endcut + Miss Roll Strip + Strip Finish Endcut',
  'Delta = Influx − ERP  (days with both)',
];
