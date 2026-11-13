'use client';

/**
 * RMD running rate drill-down — billet input ÷ adjusted running hours for the dashboard's period,
 * per day / week / month, all from the ERP log sheet (the plant, 13 Nov 2026). Single-stand time
 * is inside the running hours and counts half. Online / Offline: that rolling's entries only.
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox, { type SourceSystem } from '@/components/drill/SourceBox';
import { useDrillRange } from '@/components/drill/useDrillRange';
import { dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmdTphPeriod, type RmdRunningRateReport } from '@/services/hsmApi';

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
        { label: 'Billet input', value: f(t.inputMt), unit: 'MT' },
        { label: 'Adjusted hours', value: f(t.adjustedH, 1), unit: 'h' },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Running rate by period: ${rows.map((x) => `${x.label} ${f(x.rateTph)} TPH`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Running rate by period">
          <thead><tr><th>Period</th><th className="r">Billet input (MT)</th><th className="r">Running hours</th><th className="r">Single stand (h)</th><th className="r">Adjusted hours</th><th className="r">Rate (TPH)</th></tr></thead>
          <tbody>{rows.map((x) => <Row key={x.key} r={x} />)}</tbody>
          <tfoot><Row r={t} /></tfoot>
        </table>
      </div>
      <SourceBox sources={sourcesOf(data.mode)} formula={[
        'Running rate = INPUT_MT ÷ adjusted running hours, the same entries',
        'Adjusted running hours = double-stand hours + single-stand hours ÷ 2',
        'MILL_SINGLE_STAND is in minutes and inside ACTUAL_RUNNING_HRS, so adjusted = ACTUAL_RUNNING_HRS − MILL_SINGLE_STAND ÷ 120',
      ]} />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

function Row({ r }: { r: RmdTphPeriod }) {
  const range = r.days > 1 && r.key !== 'total';
  return (
    <tr>
      <td><b>{r.label}</b>{range && <span className="pd-dim"> · {dm(r.fromDate)}–{dm(r.toDate)}</span>}</td>
      <td className="num r">{f(r.inputMt)}</td>
      <td className="num r">{f(r.runH, 1)}</td>
      <td className="num r">{f(r.singleStandH, 2)}</td>
      <td className="num r">{f(r.adjustedH, 2)}</td>
      <td className={`num r ${r.rateTph === null ? 'v-na' : 'v-val'}`}><b>{f(r.rateTph)}</b></td>
    </tr>
  );
}

const sourcesOf = (mode: RmdRunningRateReport['mode']): SourceSystem[] => [{
  name: 'ERP',
  rows: [
    ['Table', mode === 'all' ? 'ATTR_TRAN_DATA_BODY' : 'ATTR_TRAN_DATA_HEAD + ATTR_TRAN_DATA_BODY'],
    ['Filter', mode === 'all' ? "USER_CODE = 'FA-SKJ'"
      : `USER_CODE = 'FA-SKJ', TRAN_COLUMN_NAME1 = '${mode === 'online' ? 'RO001' : 'RO002'}' (${mode === 'online' ? 'Online' : 'Offline'})`],
    ['Field', "ATTR_CODE = 'INPUT_MT', 'ACTUAL_RUNNING_HRS', 'MILL_SINGLE_STAND' (value in ATTR_VALUE)"],
  ],
}];
