'use client';

/**
 * RMD TPH drill-down — the ERP log sheet's delivery rate (DELIVERY_RATE_MTHRS, the plant's sheet, the user, 25 Nov
 * 2026), per day / week / month. A day: the ERP's figure. A week or month: its entries' rates weighted by their
 * running hours, every entry as the ERP has it — a wrong one (7 Nov 2026 Online: 260 h) shows here, to be fixed in
 * the ERP. Online / Offline: that rolling's entries only.
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
      title="TPH · delivery rate"
      sub="RMD · MT per hour"
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
    { id: 'rate', name: 'TPH', token: '--s-prod', type: 'line', data: rows.map((x) => x.rateTph), dp: 2 },
  ], [rows]);
  const axes = useMemo(() => [{ title: 'TPH', unit: 'TPH', min: 0 }], []);
  return (
    <>
      <Stats items={[
        { label: 'TPH', value: f(t.rateTph), unit: 'MT/h' },
        { label: 'Running hours', value: f(t.runH, 1), unit: 'h' },
        { label: 'Entries', value: String(t.entries), unit: `in ${t.days} days` },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`TPH by period: ${rows.map((x) => `${x.label} ${f(x.rateTph)} TPH`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="TPH by period">
          <thead><tr><th>Period</th><th className="r">Entries</th><th className="r">Running hours</th><th className="r">TPH</th></tr></thead>
          <tbody>{rows.map((x) => <Row key={x.key} r={x} />)}</tbody>
          <tfoot><Row r={t} /></tfoot>
        </table>
      </div>
      <SourceBox sources={sourcesOf(data.mode)} formula={[
        'TPH = DELIVERY_RATE_MTHRS of each entry, exactly as the ERP has it',
        'A week or month: Σ (DELIVERY_RATE_MTHRS × ACTUAL_RUNNING_HRS) ÷ Σ ACTUAL_RUNNING_HRS over its entries — none left out, so a wrong entry shows',
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
      <td className="num r">{r.entries}</td>
      <td className="num r">{f(r.runH, 2)}</td>
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
    ['Field', "ATTR_CODE = 'DELIVERY_RATE_MTHRS', 'ACTUAL_RUNNING_HRS' (value in ATTR_VALUE)"],
  ],
}];
