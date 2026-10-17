'use client';

/**
 * RMD Asset Health · Run hours drill-down: the hours the mill ran, per day / week / month over the
 * dashboard's period — ERP Production Log Sheet (FA-SKJ), ACTUAL_RUNNING_HRS (the user, 14 Oct
 * 2026). The whole mill, not one drive group.
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox from '@/components/drill/SourceBox';
import { useDrillRange } from '@/components/drill/useDrillRange';
import { dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmdProductionPeriod, type RmdProductionReport } from '@/services/hsmApi';

const h = (v: number | null) => (v === null ? '—' : fmtNum(v, 1));

export default function RmdRunHoursDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const r = useDrillRange(['selection'], 'selection');
  const url = open && r.dates ? rangeUrl('/api/rmd/production', { ...r.dates, grain: r.grain }) : null;
  const { data, dataUrl, loading, error } = useApi<RmdProductionReport>(url);
  return (
    <DrillDrawer open={open} onClose={onClose} title="Run hours" sub="RMD · h" controls={r.controls}
      loading={loading} stale={!!data && dataUrl !== url} error={error} hasData={!!data}>
      {data && <Content data={data} />}
    </DrillDrawer>
  );
}

function Content({ data }: { data: RmdProductionReport }) {
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'run', name: 'Run hours', token: '--s-prod', type: 'column', data: rows.map((x) => x.runningHrs), dp: 1 },
  ], [rows]);
  const axes = useMemo(() => [{ title: 'h', unit: 'h', min: 0 }], []);
  const perDay = t.runningHrs !== null && t.entryDays ? t.runningHrs / t.entryDays : null;
  return (
    <>
      <Stats items={[
        { label: 'Run hours', value: h(t.runningHrs), unit: 'h' },
        { label: 'Per day', value: h(perDay), unit: 'h · days entered' },
        { label: 'Days entered', value: String(t.entryDays), unit: `of ${t.days}` },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Run hours by period: ${rows.map((x) => `${x.label} ${h(x.runningHrs)} h`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Run hours by period">
          <thead><tr><th>Period</th><th className="r">Run hours</th><th className="r">Days entered</th></tr></thead>
          <tbody>{rows.map((x) => <Row key={x.key} r={x} />)}</tbody>
          <tfoot><Row r={t} /></tfoot>
        </table>
      </div>
      <SourceBox
        sources={[{ name: 'ERP', rows: [
          ['Table', 'ATTR_TRAN_DATA_BODY'],
          ['Filter', "USER_CODE = 'FA-SKJ'"],
          ['Field', "ATTR_CODE = 'ACTUAL_RUNNING_HRS' (value in ATTR_VALUE), by VRDATE"],
        ] }]}
        formula={['Run hours = Σ ACTUAL_RUNNING_HRS of the period\'s entries (the whole mill)', 'Per day = run hours ÷ days entered']}
      />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

function Row({ r }: { r: RmdProductionPeriod }) {
  const range = r.days > 1 && r.key !== 'total';
  return (
    <tr>
      <td><b>{r.label}</b>{range && <span className="pd-dim"> · {dm(r.fromDate)}–{dm(r.toDate)}</span>}</td>
      <td className={`num r ${r.runningHrs === null ? 'v-na' : 'v-val'}`}>{h(r.runningHrs)}</td>
      <td className="num r">{r.entryDays} of {r.days}</td>
    </tr>
  );
}
