'use client';

/**
 * Running rate drill-down — ERP beside Influx for the dashboard's period, per day / week /
 * month: the two rates and their delta, a chart of the two lines, a table of the same
 * numbers, and where they come from. ERP divides by the hours operators enter; Influx by
 * the hours the billet counter shows the mill running — the delta is how far those agree.
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from './DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from './DrillChart';
import SourceBox, { type SourceSystem } from './SourceBox';
import { useDrillRange } from './useDrillRange';
import { dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RunningRateReport } from '@/services/hsmApi';

type Row = RunningRateReport['totals'];

const f = (v: number | null) => fmtNum(v, 2);
const tone = (v: number | null) => (v === null ? 'v-na' : Math.abs(v) < 0.005 ? 'v-ok' : 'v-warn');

export default function RunningRateDrawer(props: { open: boolean; onClose: () => void }) {
  // The same period as the dashboard, so the drawer's totals are the panel's.
  const r = useDrillRange(['selection'], 'selection');
  const url = props.open && r.dates ? rangeUrl('/api/hsm/running-rate', { ...r.dates, grain: r.grain }) : null;
  const { data, dataUrl, loading, error } = useApi<RunningRateReport>(url);
  return (
    <DrillDrawer
      open={props.open}
      onClose={props.onClose}
      title="Running rate · ERP vs Influx"
      sub="HSM · TPH"
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

function Content({ data }: { data: RunningRateReport }) {
  const t = data.totals;
  const rows = data.rows;
  /** Influx − ERP, only where the ERP is entered for every day of the row. */
  const delta = (x: Row) => (x.rateTph !== null && x.erpRateTph !== null && !!data.erp.lastDate && x.toDate <= data.erp.lastDate
    ? x.rateTph - x.erpRateTph
    : null);
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'erp', name: 'ERP', token: '--s-prod', type: 'line', data: rows.map((x) => x.erpRateTph), dp: 2 },
    { id: 'influx', name: 'Influx', token: '--s-order', type: 'line', data: rows.map((x) => x.rateTph), dp: 2 },
  ], [rows]);
  const axes = useMemo(() => [{ title: 'TPH', unit: 'TPH', min: 0 }], []);
  const tooltip = useMemo(() => (i: number, visible: Set<string>) => {
    const x = rows[i];
    if (!x) return '';
    const lines = [`<b>${x.label}</b>`];
    if (visible.has('erp')) lines.push(`ERP: <b>${f(x.erpRateTph)} TPH</b>`);
    if (visible.has('influx')) lines.push(`Influx: <b>${f(x.rateTph)} TPH</b>`);
    const d = delta(x);
    // The delta needs both lines.
    if (visible.has('erp') && visible.has('influx') && d !== null) lines.push(`Delta: <b>${f(d)} TPH</b>`);
    return lines.join('<br/>');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);
  const d = delta(t);

  return (
    <>
      <Stats items={[
        { label: 'ERP', value: f(t.erpRateTph), unit: 'TPH' },
        { label: 'Influx', value: f(t.rateTph), unit: 'TPH' },
        { label: 'Delta', value: f(d), unit: 'TPH', tone: tone(d) },
      ]} />

      <DrillChart
        series={series}
        categories={categories}
        axes={axes}
        tooltip={tooltip}
        ariaLabel={`Running rate by period: ${rows.map((x) => `${x.label} ERP ${f(x.erpRateTph)}, Influx ${f(x.rateTph)} TPH`).join('; ')}`}
      />

      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Running rate by period">
          <thead>
            <tr>
              <th>Period</th>
              <th className="r">ERP (TPH)</th>
              <th className="r">Influx (TPH)</th>
              <th className="r">Delta (TPH)</th>
            </tr>
          </thead>
          <tbody>{rows.map((x) => <RateRow key={x.key} r={x} d={delta(x)} />)}</tbody>
          <tfoot><RateRow r={t} d={d} /></tfoot>
        </table>
      </div>

      <SourceBox sources={SOURCES} formula={formula(data.gapMinutes)} />
      {data.influx.connection === 'down' && <p className="v-warn">{data.influx.message}</p>}
    </>
  );
}

function RateRow({ r, d }: { r: Row; d: number | null }) {
  const range = r.days > 1 && r.key !== 'total';
  return (
    <tr>
      <td><b>{r.label}</b>{range && <span className="pd-dim"> · {dm(r.fromDate)}–{dm(r.toDate)}</span>}</td>
      <td className="num r v-val">{f(r.erpRateTph)}</td>
      <td className="num r v-val">{f(r.rateTph)}</td>
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
      ['Field', "ATTR_CODE = 'PRODUCTION_MT', 'NET_RUNNING_HRS', summed per VRDATE"],
    ],
  },
  {
    name: 'Influx',
    rows: [
      ['Tag', 'Total_Production_Ton, Dicharged_Billet'],
      ['Filter', "_measurement = 'HSM', Unit = 'Finishing Mill', Group = 'General'"],
    ],
  },
];

const formula = (gapMinutes: number) => [
  'ERP rate = PRODUCTION_MT ÷ NET_RUNNING_HRS',
  'Influx rate = Influx production ÷ running hours',
  `Running hours = time between two Dicharged_Billet counts, when ${gapMinutes} min or less apart`,
  'Delta = Influx − ERP  (days with both)',
];
