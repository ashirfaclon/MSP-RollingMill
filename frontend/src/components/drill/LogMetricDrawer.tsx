'use client';

/**
 * One HSM log-sheet figure on its own (performance.xlsx, the user, 25 Nov 2026): defective, CCM bypass, HSM
 * bypass or breakdown hours per day / week / month over the dashboard's period, for the Rolling chosen in the
 * top bar — the total, a column chart, a table beside the figure it is read against, and the source.
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from './DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from './DrillChart';
import SourceBox from './SourceBox';
import { useDrillRange } from './useDrillRange';
import { dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type LogPeriod, type LogSheetReport } from '@/services/hsmApi';
import { RMD_MODE_LABELS, useGlobalSel } from '@/state/globalSel';

export type LogMetric = 'rollingDefectMt' | 'ccmBypassMt' | 'hsmBypassMt' | 'breakdownHrs';
type Num = Exclude<{ [K in keyof LogPeriod]: LogPeriod[K] extends number | null ? K : never }[keyof LogPeriod], undefined>;

export const LOG_METRICS: Record<LogMetric, {
  name: string; unit: string; field: string; token: string;
  /** The figure it is read against, beside it in the table. */
  against: { key: Num; name: string; unit: string; field: string };
}> = {
  rollingDefectMt: { name: 'Defective', unit: 'MT', field: 'ROLLING_DEFECT_MT', token: '--risk',
    against: { key: 'productionMt', name: 'Production', unit: 'MT', field: 'PRODUCTION_MT' } },
  ccmBypassMt: { name: 'CCM bypass', unit: 'MT', field: 'CCM_BY_PASSMT', token: '--s-alt',
    against: { key: 'inputMt', name: 'Billet input', unit: 'MT', field: 'INPUT_MT' } },
  hsmBypassMt: { name: 'HSM bypass', unit: 'MT', field: 'HSM_BYPASS_MT', token: '--violet',
    against: { key: 'inputMt', name: 'Billet input', unit: 'MT', field: 'INPUT_MT' } },
  breakdownHrs: { name: 'Breakdown', unit: 'h', field: 'DELAY_HRS', token: '--risk',
    against: { key: 'productionMt', name: 'Production', unit: 'MT', field: 'PRODUCTION_MT' } },
};

const f = (v: number | null | undefined) => (v === null || v === undefined ? '—' : fmtNum(v, 2));

export default function LogMetricDrawer({ metric, onClose }: { metric: LogMetric | null; onClose: () => void }) {
  const mode = useGlobalSel().rmdMode;
  const r = useDrillRange(['selection'], 'selection');
  const url = metric && r.dates ? rangeUrl('/api/hsm/logsheet', { ...r.dates, grain: r.grain }) : null;
  const { data, dataUrl, loading, error } = useApi<LogSheetReport>(url);
  const m = LOG_METRICS[metric ?? 'breakdownHrs'];
  return (
    <DrillDrawer open={metric !== null} onClose={onClose} title={`${m.name} · ERP log sheet`}
      sub={`HSM · ${mode === 'all' ? 'Online + Offline' : RMD_MODE_LABELS[mode]} · ${m.unit === 'h' ? 'hours' : m.unit}`}
      controls={r.controls} loading={loading} stale={!!data && dataUrl !== url} error={error} hasData={!!data}>
      {data && metric && <Content data={data} metric={metric} />}
    </DrillDrawer>
  );
}

function Content({ data, metric }: { data: LogSheetReport; metric: LogMetric }) {
  const m = LOG_METRICS[metric];
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: metric, name: m.name, token: m.token, type: 'column', data: rows.map((x) => x[metric]), dp: 2 },
  ], [rows, metric, m]);
  const axes = useMemo(() => [{ title: m.unit, unit: m.unit, min: 0 }], [m.unit]);
  return (
    <>
      <Stats items={[
        { label: m.name, value: f(t[metric]), unit: m.unit },
        { label: m.against.name, value: f(t[m.against.key]), unit: m.against.unit },
        { label: 'Days entered', value: String(t.entryDays), unit: `of ${t.days}` },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`${m.name} by period: ${rows.map((x) => `${x.label} ${f(x[metric])} ${m.unit}`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label={`${m.name} by period`}>
          <thead><tr><th>Period</th><th className="r">{m.name} ({m.unit})</th><th className="r">{m.against.name} ({m.against.unit})</th></tr></thead>
          <tbody>{rows.map((x) => <Row key={x.key} x={x} metric={metric} />)}</tbody>
          <tfoot><Row x={t} metric={metric} /></tfoot>
        </table>
      </div>
      <SourceBox
        sources={[{ name: 'ERP', rows: [
          ['Table', 'ATTR_TRAN_DATA_HEAD ⋈ ATTR_TRAN_DATA_BODY'],
          ['Filter', "ENTITY 'MP' · DIV 'S1' · TNATURE 'PRLOG' · SERIES 'L6P'"],
          ['Rolling', 'TRAN_COLUMN_NAME1: ST001 = Online, ST002 = Offline'],
          ['Field', `ATTR_CODE = '${m.field}', '${m.against.field}' (value in ATTR_VALUE)`],
        ] }]}
        formula={[`${m.name} = Σ ${m.field} of the chosen rolling's entries (Both adds Online and Offline)`]}
      />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

function Row({ x, metric }: { x: LogPeriod; metric: LogMetric }) {
  const m = LOG_METRICS[metric];
  return (
    <tr>
      <td><b>{x.label}</b>{x.days > 1 && x.key !== 'total' && <span className="pd-dim"> · {dm(x.fromDate)}–{dm(x.toDate)}</span>}</td>
      <td className="num r v-val"><b>{f(x[metric])}</b></td>
      <td className="num r">{f(x[m.against.key])}</td>
    </tr>
  );
}
