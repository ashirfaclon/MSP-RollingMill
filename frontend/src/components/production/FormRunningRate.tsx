'use client';

/**
 * LSM / RMS running rate — ERP production ÷ running hours, the running hours calculated from the
 * mill's Production Sheet form (each run's start → end, overlaps merged; /api/{mill}/running-rate).
 * The footer figure of Production by shift, and its drill-down per day / week / month.
 */
import { useMemo, useState } from 'react';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox, { type SourceSystem } from '@/components/drill/SourceBox';
import { useDrillRange } from '@/components/drill/useDrillRange';
import { fixed } from '@/lib/num';
import { dm, useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type FormRunningRateReport, type RmdRatePeriod } from '@/services/hsmApi';

type Mill = 'lsm' | 'rms';
const f = (v: number | null, dp = 2) => (v === null ? '—' : fmtNum(v, dp));

const MILL: Record<Mill, { name: string; field: string; day: string; erp: SourceSystem; form: string }> = {
  lsm: {
    name: 'LSM', field: 'PRODUTION_MT', day: 'Day = 09:00 IST → 09:00 IST',
    form: 'Light Structure Mill → LSM Production Sheet → PRODUCTION SHEET',
    erp: { name: 'ERP', rows: [
      ['Table', 'ATTR_TRAN_DATA_BODY'],
      ['Filter', "USER_CODE = 'FA-LP-P' (division LS)"],
      ['Field', "ATTR_CODE = 'PRODUTION_MT' (value in ATTR_VALUE)"],
    ] },
  },
  rms: {
    name: 'RMS', field: 'PRODUCTION_MT', day: 'Day = 09:30 IST → 09:30 IST',
    form: 'Rolling Mill Structure (RMS) → RMS Production Sheet → PRODUCTION SHEET',
    erp: { name: 'ERP', rows: [
      ['Table', 'ATTR_TRAN_DATA_HEAD + ATTR_TRAN_DATA_BODY'],
      ['Filter', "ENTITY_CODE = 'MP', DIV_CODE = 'RS', TNATURE = 'PRLOG', SERIES = 'L5P'"],
      ['Field', "ATTR_CODE = 'PRODUCTION_MT' (value in ATTR_VALUE)"],
    ] },
  },
};

/** The running-rate readout under Production by shift; opens the drill-down. */
export function FormRunningRateFoot({ mill }: { mill: Mill }) {
  const { dates } = useSelection();
  const url = rangeUrl(`/api/${mill}/running-rate`, dates ? { ...dates, grain: 'day' } : null);
  const { data, dataUrl, error } = useApi<FormRunningRateReport>(url);
  const current = data && dataUrl === url ? data : null;
  const rate = current?.totals.rateTph ?? null;
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="rm-foot-item rm-foot-btn" onClick={() => setOpen(true)} aria-haspopup="dialog" title="Running rate per day">
        <span className="rm-k">Running rate</span>
        {!current && !error
          ? <span className="skel skel--num" role="status" aria-label="Loading" />
          : <span className={`rm-foot-v num ${rate === null ? 'v-na' : 'v-val'}`}>{rate === null ? 'NA' : `${fixed(rate, 2)} TPH`}</span>}
      </button>
      <FormRunningRateDrawer mill={mill} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function FormRunningRateDrawer({ mill, open, onClose }: { mill: Mill; open: boolean; onClose: () => void }) {
  const r = useDrillRange(['selection'], 'selection');
  const url = open && r.dates ? rangeUrl(`/api/${mill}/running-rate`, { ...r.dates, grain: r.grain }) : null;
  const { data, dataUrl, loading, error } = useApi<FormRunningRateReport>(url);
  return (
    <DrillDrawer open={open} onClose={onClose} title="Running rate" sub={`${MILL[mill].name} · TPH`} controls={r.controls}
      loading={loading} stale={!!data && dataUrl !== url} error={error} hasData={!!data}>
      {data && <Content data={data} mill={mill} />}
    </DrillDrawer>
  );
}

function Content({ data, mill }: { data: FormRunningRateReport; mill: Mill }) {
  const m = MILL[mill];
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
        { label: 'Production', value: f(t.productionMt), unit: 'MT' },
        { label: 'Running hours', value: f(t.runH, 1), unit: 'h' },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Running rate by period: ${rows.map((x) => `${x.label} ${f(x.rateTph)} TPH`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Running rate by period">
          <thead><tr><th>Period</th><th className="r">Production (MT)</th><th className="r">Running hours</th><th className="r">Rate (TPH)</th></tr></thead>
          <tbody>{rows.map((x) => <Row key={x.key} r={x} />)}</tbody>
          <tfoot><Row r={t} /></tfoot>
        </table>
      </div>
      <SourceBox
        sources={[m.erp, { name: 'Logbook', rows: [['Form', m.form], ['Field', 'start-time → end-time of each entry (clock time), by its date']] }]}
        formula={[
          `Running rate = ${m.field} ÷ running hours  (days with both)`,
          'Running hours = Σ of the day\'s runs, start → end; overlapping runs counted once',
          m.day,
        ]}
      />
      {data.logbook.connection === 'down' && <p className="v-warn">{data.logbook.message}</p>}
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
