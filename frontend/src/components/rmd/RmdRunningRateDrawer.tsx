'use client';

/**
 * RMD running rate drill-down — production ÷ running hours for the dashboard's period, per
 * day / week / month. Production is ERP Prime + SL; running hours come from the two billet
 * counters (either line feeding billets ≤ 10 min apart). No ERP running-hours field has been
 * given for RMD, so there is no ERP rate beside it.
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox, { type SourceSystem } from '@/components/drill/SourceBox';
import { useDrillRange } from '@/components/drill/useDrillRange';
import { dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmdRatePeriod, type RmdRunningRateReport } from '@/services/hsmApi';

const f = (v: number | null, dp = 2) => (v === null ? '—' : fmtNum(v, dp));

export default function RmdRunningRateDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const r = useDrillRange(['selection'], 'selection');
  const url = open && r.dates ? rangeUrl('/api/rmd/running-rate', { ...r.dates, grain: r.grain }) : null;
  const { data, dataUrl, loading, error } = useApi<RmdRunningRateReport>(url);
  return (
    <DrillDrawer
      open={open}
      onClose={onClose}
      title="Running rate"
      sub="RMD · TPH"
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

function Content({ data }: { data: RmdRunningRateReport }) {
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'rate', name: 'Running rate', token: '--s-prod', type: 'line', data: rows.map((x) => x.rateTph), dp: 2 },
  ], [rows]);
  const axes = useMemo(() => [{ title: 'TPH', unit: 'TPH', min: 0 }], []);
  return (
    <>
      <Stats items={[
        { label: 'Running rate', value: f(t.rateTph), unit: 'TPH' },
        { label: 'Prime + SL', value: f(t.productionMt), unit: 'MT' },
        { label: 'Running hours', value: f(t.runH, 1), unit: 'h' },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Running rate by period: ${rows.map((x) => `${x.label} ${f(x.rateTph)} TPH`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Running rate by period">
          <thead><tr><th>Period</th><th className="r">Prime + SL (MT)</th><th className="r">Running hours</th><th className="r">Rate (TPH)</th></tr></thead>
          <tbody>{rows.map((x) => <Row key={x.key} r={x} />)}</tbody>
          <tfoot><Row r={t} /></tfoot>
        </table>
      </div>
      {data.hoursFrom === 'erp' ? (
        <SourceBox sources={erpSources(data.mode === 'online' ? 'RO001' : 'RO002')} formula={[
          'Running rate = PRODUCT_PRIME_SLENGTH_MT ÷ ACTUAL_RUNNING_HRS, the same entries',
        ]} />
      ) : (
        <SourceBox sources={SOURCES} formula={[
          'Running rate = PRODUCT_PRIME_SLENGTH_MT ÷ running hours',
          `Running hours = time between two BILLET_COUNT counts (either line), when ${data.gapMinutes} min or less apart`,
          'Day = 09:00 IST → 09:00 IST',
        ]} />
      )}
      {data.influx.connection === 'down' && <p className="v-warn">{data.influx.message}</p>}
    </>
  );
}

function Row({ r }: { r: RmdRatePeriod }) {
  const range = r.days > 1 && r.key !== 'total';
  return (
    <tr>
      <td><b>{r.label}</b>{range && <span className="pd-dim"> · {dm(r.fromDate)}–{dm(r.toDate)}</span>}</td>
      <td className="num r">{f(r.productionMt)}</td>
      <td className="num r">{f(r.runH, 1)}</td>
      <td className={`num r ${r.rateTph === null ? 'v-na' : 'v-val'}`}><b>{f(r.rateTph)}</b></td>
    </tr>
  );
}

const SOURCES: SourceSystem[] = [
  {
    name: 'ERP',
    rows: [
      ['Table', 'ATTR_TRAN_DATA_BODY'],
      ['Filter', "USER_CODE = 'FA-SKJ'"],
      ['Field', "ATTR_CODE = 'PRODUCT_PRIME_SLENGTH_MT' (value in ATTR_VALUE)"],
    ],
  },
  {
    name: 'Influx',
    rows: [
      ['Tag', 'BILLET_COUNT'],
      ['Filter', "_measurement = 'TMT-RMD', Unit = 'CR Mill1/2', Group = 'M1', 'M2'"],
    ],
  },
];

/** Online / Offline: the billet counters can't tell the two rollings apart, so the hours are the ERP's (the user, 13 Nov 2026). */
const erpSources = (code: 'RO001' | 'RO002'): SourceSystem[] => [{
  name: 'ERP',
  rows: [
    ['Table', 'ATTR_TRAN_DATA_HEAD + ATTR_TRAN_DATA_BODY'],
    ['Filter', `USER_CODE = 'FA-SKJ', TRAN_COLUMN_NAME1 = '${code}' (${code === 'RO001' ? 'Online' : 'Offline'})`],
    ['Field', "ATTR_CODE = 'PRODUCT_PRIME_SLENGTH_MT', 'ACTUAL_RUNNING_HRS' (value in ATTR_VALUE)"],
  ],
}];
