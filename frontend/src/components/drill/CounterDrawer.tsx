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
}

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
    { id: 'influx', name: 'Influx', token: '--s-order', type: 'line', data: rows.map((x) => x.influxMt), dp: config.dp },
  ], [rows, config]);
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const axes = useMemo(() => [{ title: u, unit: u }], [u]);
  const tooltip = useMemo(() => (i: number, visible: Set<string>) => {
    const x = rows[i];
    if (!x) return '';
    const lines = [`<b>${x.label}</b>`];
    if (visible.has('erp')) lines.push(`ERP: <b>${f(x.erpMt)} ${u}</b>`);
    if (visible.has('influx')) lines.push(`Influx: <b>${f(x.influxMt)} ${u}</b>`);
    // The delta needs both lines.
    if (visible.has('erp') && visible.has('influx') && x.varianceMt !== null) lines.push(`Delta: <b>${f(x.varianceMt)} ${u}</b>`);
    return lines.join('<br/>');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, u]);

  return (
    <>
      <Stats items={[
        { label: 'ERP', value: f(t.erpMt), unit: u },
        { label: 'Influx', value: f(t.influxMt), unit: u },
        { label: 'Delta', value: f(t.varianceMt), unit: u, tone: varClass(t.varianceMt) },
      ]} />

      <DrillChart
        series={series}
        categories={categories}
        axes={axes}
        tooltip={tooltip}
        ariaLabel={`${config.tableLabel}: ${rows.map((x) => `${x.label} ERP ${f(x.erpMt)}, Influx ${f(x.influxMt)}`).join('; ')}`}
      />

      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label={config.tableLabel}>
          <thead>
            <tr>
              <th>Period</th>
              <th className="r">ERP ({u})</th>
              <th className="r">Influx ({u})</th>
              <th className="r">Delta ({u})</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => <Row key={x.key} r={x} f={f} />)}
          </tbody>
          <tfoot><Row r={t} f={f} /></tfoot>
        </table>
      </div>

      <SourceBox sources={config.sources} formula={DELTA} />
      {(data.erp.connection === 'down' || data.influx.connection === 'down') && (
        <p className="v-warn">{data.erp.connection === 'down' ? data.erp.message : data.influx.message}</p>
      )}
    </>
  );
}

function Row({ r, f }: { r: PeriodRow; f: (v: number | null) => string }) {
  const range = r.days > 1 && r.key !== 'total';
  return (
    <tr>
      <td><b>{r.label}</b>{range && <span className="pd-dim"> · {dm(r.fromDate)}–{dm(r.toDate)}</span>}</td>
      <td className="num r v-val">{f(r.erpMt)}</td>
      <td className="num r v-val">{f(r.influxMt)}</td>
      <td className={`num r ${varClass(r.varianceMt)}`}>{f(r.varianceMt)}</td>
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

export const PRODUCTION_COUNTER: CounterConfig = {
  path: '/api/hsm/production',
  title: 'Production · ERP vs Influx',
  sub: 'HSM · MT',
  unit: 'MT',
  dp: 2,
  tableLabel: 'Production by period',
  sources: [erpLogSheet('PRODUCTION_MT'), influxCounter('Total_Production_Ton')],
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
