'use client';

/**
 * An ERP log-sheet figure beside the Influx counter that measures the same thing, for the
 * period chosen on the dashboard, per day / week / month: the two totals and their
 * delta, a chart of the two lines, and a table of the same numbers. Production (MT)
 * and billets (pieces) both open this.
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from './DrillDrawer';
import SourceBox, { type SourceSystem } from './SourceBox';
import DrillChart, { fmtNum, type DrillSeries } from './DrillChart';
import { useDrillRange } from './useDrillRange';
import { dm, useProduction, type PeriodRow, type ProductionComparison } from '@/services/hsmProduction';
import { rangeUrl, useApi } from '@/services/hsmApi';

export const hhmm = (iso: string | null) => (iso
  ? `${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date(iso))} IST`
  : '—');
const varClass = (v: number | null) => (v === null ? 'v-na' : Math.abs(v) < 0.005 ? 'v-ok' : 'v-warn');

export interface CounterConfig {
  /** API path; production has its own hook for the card, the rest go through useApi. */
  path: '/api/hsm/production' | '/api/hsm/billets';
  title: string;
  sub: string;
  unit: string;
  dp: number;
  tableLabel: string;
  /** Where the two figures are read from: the ERP log-sheet field and the Influx tag. */
  sources: SourceSystem[];
  /**
   * Production: Influx is the counter inside the Shift Setup Checklist's working hours, not the whole plant
   * day (the user, 24 Nov 2026); a day without checklist times is NA. Each day's hours show in the table.
   */
  working?: boolean;
}

/** A row's Influx figure and its delta, by the config's basis. */
const influxOf = (x: PeriodRow, c: CounterConfig) => (c.working ? x.workingMt ?? null : x.influxMt);
const deltaOf = (x: PeriodRow, c: CounterConfig) => (c.working ? x.workingVarianceMt ?? null : x.varianceMt);

export default function CounterDrawer({ open, onClose, config }: { open: boolean; onClose: () => void; config: CounterConfig }) {
  // The same period as the dashboard, so the drawer's totals are the card's.
  const r = useDrillRange(['selection'], 'selection');
  const params = open && r.dates ? { ...r.dates, grain: r.grain } : null;
  // Production shares the card's hook (and its cache); billets go through the generic one.
  const prod = useProduction(config.path === '/api/hsm/production' ? params : null);
  const other = useApi<ProductionComparison>(config.path === '/api/hsm/production' ? null : rangeUrl(config.path, params));
  const { data, loading, error } = config.path === '/api/hsm/production' ? prod : other;
  const stale = !!data && !!r.dates && (data.from !== r.dates.from || data.to !== r.dates.to || data.grain !== r.grain);

  return (
    <DrillDrawer
      open={open}
      onClose={onClose}
      title={config.title}
      sub={config.sub}
      controls={r.controls}
      loading={loading}
      stale={stale}
      error={error}
      hasData={!!data}
    >
      {data && <Content data={data} config={config} />}
    </DrillDrawer>
  );
}

function Content({ data, config }: { data: ProductionComparison; config: CounterConfig }) {
  const t = data.totals;
  const u = config.unit;
  const f = (v: number | null) => fmtNum(v, config.dp);
  const rows = data.rows;
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'erp', name: 'ERP', token: '--s-prod', type: 'line', data: rows.map((x) => x.erpMt), dp: config.dp },
    { id: 'influx', name: config.working ? 'Influx · working hours' : 'Influx', token: '--s-order', type: 'line', data: rows.map((x) => influxOf(x, config)), dp: config.dp },
  ], [rows, config]);
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const axes = useMemo(() => [{ title: u, unit: u }], [u]);
  const tooltip = useMemo(() => (i: number, visible: Set<string>) => {
    const x = rows[i];
    if (!x) return '';
    const lines = [`<b>${x.label}</b>`];
    if (visible.has('erp')) lines.push(`ERP: <b>${f(x.erpMt)} ${u}</b>`);
    if (visible.has('influx')) lines.push(`Influx: <b>${f(influxOf(x, config))} ${u}</b>`);
    // The delta needs both lines.
    if (visible.has('erp') && visible.has('influx') && deltaOf(x, config) !== null) lines.push(`Delta: <b>${f(deltaOf(x, config))} ${u}</b>`);
    return lines.join('<br/>');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, u]);

  return (
    <>
      <Stats items={[
        { label: 'ERP', value: f(t.erpMt), unit: u },
        { label: config.working ? 'Influx · working hours' : 'Influx', value: f(influxOf(t, config)), unit: config.working && t.workingDays !== undefined ? `${u} · ${t.workingDays} of ${t.days} days` : u },
        { label: 'Delta', value: f(deltaOf(t, config)), unit: u, tone: varClass(deltaOf(t, config)) },
      ]} />

      <DrillChart
        series={series}
        categories={categories}
        axes={axes}
        tooltip={tooltip}
        ariaLabel={`${config.tableLabel}: ${rows.map((x) => `${x.label} ERP ${f(x.erpMt)}, Influx ${f(influxOf(x, config))}`).join('; ')}`}
      />

      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label={config.tableLabel}>
          <thead>
            <tr>
              <th>Period</th>
              <th className="r">ERP ({u})</th>
              <th className="r">{config.working ? `Influx · working hours (${u})` : `Influx (${u})`}</th>
              <th className="r">Delta ({u})</th>
              {config.working && data.grain === 'day' && <th>Working hours</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => <Row key={x.key} r={x} f={f} config={config} hours={config.working && data.grain === 'day' ? hoursOf(data, x.fromDate) : undefined} />)}
          </tbody>
          <tfoot><Row r={t} f={f} config={config} hours={config.working && data.grain === 'day' ? '' : undefined} /></tfoot>
        </table>
      </div>

      <SourceBox sources={config.sources} formula={config.working ? WORKING_FORMULA : DELTA} />
      {config.working && data.checklist?.connection === 'down' && <p className="v-warn">{data.checklist.message}</p>}
      {(data.erp.connection === 'down' || data.influx.connection === 'down') && (
        <p className="v-warn">{data.erp.connection === 'down' ? data.erp.message : data.influx.message}</p>
      )}
    </>
  );
}

/** A plant date's checklist hours, "Day 08:00–16:00 · Night 20:00–02:00"; "—" when none is filled in. */
const hoursOf = (data: ProductionComparison, date: string) => {
  const w = data.days.find((d) => d.date === date)?.workingWindows ?? [];
  return w.length ? w.map((x) => `${x.shift} ${x.start}–${x.end}`).join(' · ') : '—';
};

function Row({ r, f, config, hours }: { r: PeriodRow; f: (v: number | null) => string; config: CounterConfig; hours?: string }) {
  const range = r.days > 1 && r.key !== 'total';
  return (
    <tr>
      <td><b>{r.label}</b>{range && <span className="pd-dim"> · {dm(r.fromDate)}–{dm(r.toDate)}</span>}</td>
      <td className="num r v-val">{f(r.erpMt)}</td>
      <td className="num r v-val">{f(influxOf(r, config))}</td>
      <td className={`num r ${varClass(deltaOf(r, config))}`}>{f(deltaOf(r, config))}</td>
      {hours !== undefined && <td className="pd-dim">{hours}</td>}
    </tr>
  );
}

/* ------------------------------ the two uses ----------------------------- */

/** Both read the same ERP log sheet and the same Influx machine; only the field differs. */
const erpLogSheet = (field: string): SourceSystem => ({
  name: 'ERP',
  rows: [
    ['Table', 'ATTR_TRAN_DATA_HEAD + ATTR_TRAN_DATA_BODY'],
    ['Filter', "ENTITY_CODE = 'MP', DIV_CODE = 'S1', TNATURE = 'PRLOG', SERIES = 'L6P'"],
    ['Field', `ATTR_CODE = '${field}', summed per VRDATE`],
  ],
});
const influxCounter = (tag: string): SourceSystem => ({
  name: 'Influx',
  rows: [
    ['Tag', tag],
    ['Filter', "_measurement = 'HSM', Unit = 'Finishing Mill', Group = 'General'"],
  ],
});
const DELTA = ['Delta = Influx − ERP  (days with both)'];
const WORKING_FORMULA = [
  'Influx · working hours = the counter\'s production inside the day\'s Shift Setup Checklist hours (start → end of each shift filled in)',
  'A day with a Day and a Night entry: both windows added, the gap between them left out; no checklist times: NA',
  'Delta = Influx · working hours − ERP  (days with both)',
];

export const PRODUCTION_COUNTER: CounterConfig = {
  path: '/api/hsm/production',
  title: 'Production · ERP vs Influx',
  sub: 'HSM · MT',
  unit: 'MT',
  dp: 2,
  tableLabel: 'Production by period',
  sources: [erpLogSheet('PRODUCTION_MT'), influxCounter('Total_Production_Ton'), {
    name: 'Logbook',
    rows: [['Form', 'HSM Checklists → Shift Setup Checklist'], ['Field', 'Date, Shift, Shift start time, Shift end time (HH:MM IST)']],
  }],
  working: true,
};

export const BILLET_COUNTER: CounterConfig = {
  path: '/api/hsm/billets',
  title: 'Billets · ERP vs Influx',
  sub: 'HSM · billets charged, pieces',
  unit: 'pcs',
  dp: 0,
  tableLabel: 'Billets by period',
  sources: [erpLogSheet('INPUT_PCS'), influxCounter('Dicharged_Billet')],
};
