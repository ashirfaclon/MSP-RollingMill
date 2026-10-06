'use client';

/**
 * Running rate, calculated: Influx production ÷ hours the mill was running, where running
 * = billets leaving the furnace less than 10 minutes apart. The ERP log sheet's own rate
 * (production ÷ operator-entered running hours) sits beside it for comparison.
 */
import { useMemo, useState } from 'react';
import DrillDrawer, { Stats } from './DrillDrawer';
import DrillChart, { fmtNum, type DrillAxis, type DrillSeries } from './DrillChart';
import { useDrillRange, type RangeId } from './useDrillRange';
import { hhmm } from './CounterDrawer';
import { dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RunningRateReport } from '@/services/hsmApi';
import SourceTable, { type SourceRow } from './SourceTable';

const AXES: DrillAxis[] = [
  { title: 'Running rate (TPH)', unit: 'TPH', min: 0 },
  { title: 'Running hours', unit: 'h', opposite: true, min: 0 },
];
const PAGE = 60;

const SOURCES: SourceRow[] = [
  { figure: 'Production', table: 'Influx · HSM / Finishing Mill / General', fields: 'Total_Production_Ton', filter: 'Same figure as the Production card (Total): reset events per 06:00 plant day, noise removed' },
  { figure: 'Running hours', table: 'Influx · HSM / Finishing Mill / General', fields: 'Dicharged_Billet', filter: 'Time between two billets counts as running when the gap is 10 minutes or less; split at 06:00' },
  { figure: 'Running rate', table: '—', fields: 'Production ÷ running hours', filter: 'A period: total MT ÷ total hours, not an average of daily rates' },
  { figure: 'ERP production', table: 'ATTR_TRAN_DATA_HEAD / BODY', fields: 'PRODUCTION_MT', filter: "Log sheet: ENTITY_CODE = 'MP', DIV_CODE = 'S1', TNATURE = 'PRLOG', SERIES = 'L6P'; all entries of the day summed" },
  { figure: 'ERP running hours', table: 'ATTR_TRAN_DATA_HEAD / BODY', fields: 'NET_RUNNING_HRS', filter: 'Entered by operators; all entries of the day summed' },
  { figure: 'ERP delay hours', table: 'ATTR_TRAN_DATA_HEAD / BODY', fields: 'DELAY_HRS', filter: 'Same filter' },
  { figure: 'ERP running rate', table: '—', fields: 'PRODUCTION_MT ÷ NET_RUNNING_HRS', filter: 'Equals the log sheet’s PROD_RATE_ON_RUNNING_HRS on every entry' },
];

export default function RunningRateDrawer(props: { open: boolean; onClose: () => void; initial?: RangeId }) {
  const r = useDrillRange(['selection', 'counter', 'last30'], props.initial ?? 'selection');
  const url = props.open && r.dates ? rangeUrl('/api/hsm/running-rate', { ...r.dates, grain: r.grain }) : null;
  const { data, dataUrl, loading, error } = useApi<RunningRateReport>(url);
  return (
    <DrillDrawer
      open={props.open}
      onClose={props.onClose}
      title="Running rate · calculated"
      sub="HSM · production ÷ hours the mill was running, TPH"
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

const diffClass = (v: number | null) => (v === null ? 'v-na' : 'v-val');

function Content({ data }: { data: RunningRateReport }) {
  const [all, setAll] = useState(false);
  const t = data.totals;
  const rows = data.rows;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'runH', name: 'Running hours (billets)', token: '--s-prod', type: 'column', axis: 1, data: rows.map((x) => x.runH), dp: 2 },
    { id: 'erpRunH', name: 'Running hours (ERP)', token: '--s-free', type: 'column', axis: 1, data: rows.map((x) => x.erpRunH), dp: 2 },
    { id: 'rate', name: 'Running rate (calculated)', token: '--s-order', type: 'line', data: rows.map((x) => x.rateTph), dp: 2 },
    { id: 'erpRate', name: 'Running rate (ERP)', token: '--s-free', type: 'line', dashed: true, data: rows.map((x) => x.erpRateTph), dp: 2 },
  ], [rows]);
  const runs = all ? data.runs : data.runs.slice(-PAGE);
  const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);

  return (
    <>
      <Stats items={[
        { label: 'Running rate', value: fmtNum(t.rateTph, 2), unit: 'TPH' },
        { label: 'Production', value: fmtNum(t.influxMt, 1), unit: 'MT' },
        { label: 'Running hours', value: fmtNum(t.runH, 1), unit: `h of ${fmtNum(t.elapsedH, 0)} h · ${t.runs} runs` },
        { label: 'ERP running rate', value: fmtNum(t.erpRateTph, 2), unit: 'TPH', tone: t.erpRateTph === null ? 'v-na' : 'v-val' },
      ]} />
      {data.influx.connection === 'down' && <p className="pd-notice" role="note">{data.influx.message}</p>}

      <DrillChart
        series={series}
        categories={categories}
        axes={AXES}
        ariaLabel={`Running rate per period: ${rows.map((x) => `${x.label} ${fmtNum(x.rateTph, 1)} TPH over ${fmtNum(x.runH, 1)} h`).join('; ')}`}
      />

      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Running rate by period">
          <thead>
            <tr>
              <th>Period</th>
              <th className="r">Production (MT)</th><th className="r">Running h</th><th className="r">Running rate (TPH)</th>
              <th className="r">ERP MT</th><th className="r">ERP running h</th><th className="r">ERP delay h</th><th className="r">ERP rate (TPH)</th>
              <th className="r">Difference (TPH)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => {
              const d = diff(x.rateTph, x.erpRateTph);
              return (
                <tr key={x.key}>
                  <td><b>{x.label}</b>{x.fromDate !== x.toDate && <span className="pd-dim"> · {dm(x.fromDate)}–{dm(x.toDate)}</span>}</td>
                  <td className="num r v-val">{fmtNum(x.influxMt, 2)}</td>
                  <td className="num r v-val">{fmtNum(x.runH, 2)}</td>
                  <td className="num r v-val"><b>{fmtNum(x.rateTph, 2)}</b></td>
                  <td className="num r">{fmtNum(x.erpMt, 2)}</td>
                  <td className="num r">{fmtNum(x.erpRunH, 2)}</td>
                  <td className="num r">{fmtNum(x.erpDelayH, 2)}</td>
                  <td className="num r">{fmtNum(x.erpRateTph, 2)}</td>
                  <td className={`num r ${diffClass(d)}`}>{d === null ? '—' : `${d > 0 ? '+' : ''}${fmtNum(d, 2)}`}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td><b>Total</b></td>
              <td className="num r">{fmtNum(t.influxMt, 2)}</td>
              <td className="num r">{fmtNum(t.runH, 2)}</td>
              <td className="num r"><b>{fmtNum(t.rateTph, 2)}</b></td>
              <td className="num r">{fmtNum(t.erpMt, 2)}</td>
              <td className="num r">{fmtNum(t.erpRunH, 2)}</td>
              <td className="num r">{fmtNum(t.erpDelayH, 2)}</td>
              <td className="num r">{fmtNum(t.erpRateTph, 2)}</td>
              <td className="num r">{(() => { const d = diff(t.rateTph, t.erpRateTph); return d === null ? '—' : `${d > 0 ? '+' : ''}${fmtNum(d, 2)}`; })()}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <h3 className="pd-h">Runs · billets less than {data.gapMinutes} min apart · {data.runs.length}</h3>
      <div className="pd-table-wrap pd-table-wrap--tall">
        <table className="grid pd-table" aria-label="Mill runs">
          <thead><tr><th>Plant day</th><th>Start</th><th>End</th><th className="r">Hours</th><th className="r">Billets</th></tr></thead>
          <tbody>
            {runs.map((x) => (
              <tr key={x.start}>
                <td>{dm(x.date)}</td>
                <td className="num">{hhmm(x.start)}</td>
                <td className="num">{hhmm(x.end)}</td>
                <td className="num r v-val">{fmtNum(x.hours, 2)}</td>
                <td className="num r">{x.billets}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.runs.length > PAGE && (
        <button type="button" className="pd-more" onClick={() => setAll(!all)}>
          {all ? `Show the latest ${PAGE} only` : `Show all ${data.runs.length} runs`}
        </button>
      )}

      <SourceTable rows={SOURCES} label="Data source" />

      <ul className="pd-notes">
        <li><b>Running rate</b> = production ÷ running hours. Production is the Production card&apos;s Total (Influx). Running hours are worked out from the billet counter: the mill is taken as running while billets leave the furnace less than {data.gapMinutes} minutes apart; a longer gap is a stop. Today counts up live.</li>
        <li><b>ERP</b> — log sheet, synced {hhmm(data.erp.syncedAt)}; entered up to <b>{dm(data.erp.lastDate)}</b>. Its hours are entered by hand. Most days have a second, small entry — a few billets rolled slowly over several hours (27 Sep: 9 billets, 5.36 MT, 3.75 h) — which pulls the ERP rate down. Here billets more than {data.gapMinutes} minutes apart count as stops, so those hours are not running time.</li>
        <li><b>Days split at 06:00</b> — a run that crosses 06:00 is cut there; the ERP may book it all on one day. When a single day differs a lot, compare by week.</li>
      </ul>
    </>
  );
}
