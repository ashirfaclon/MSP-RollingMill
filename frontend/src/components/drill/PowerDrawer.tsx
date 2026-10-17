'use client';

/**
 * Power consumption drill-down, for the period chosen on the dashboard: the total and each
 * meter's share, a chart and a table per day / week / month, the entries of one date at a
 * time exactly as filled in the logbook form "Electrical HSM → Power Consumption", and
 * where the figure comes from. Nothing is corrected — a wrong date or reading shows as entered.
 */
import { useMemo, useState } from 'react';
import DrillDrawer, { Stats } from './DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from './DrillChart';
import SourceBox, { type SourceSystem } from './SourceBox';
import { useDrillRange } from './useDrillRange';
import { powerPeriods, type PowerPeriod } from './powerPeriods';
import { dm } from '@/services/hsmProduction';
import type { Grain } from '@contracts';
import type { PowerEntry, PowerReport } from '@/services/hsmApi';

/** One colour per meter, in the order the meters are listed. */
const METER_TOKENS = ['--s-prod', '--s-order', '--s-alt', '--s-free', '--violet', '--s-pred'];

const k = (v: number | null | undefined) => (v === null || v === undefined ? '—' : fmtNum(v, 1));

export type PowerMill = 'hsm' | 'rmd' | 'lsm' | 'rms';

export default function PowerDrawer(props: {
  open: boolean; onClose: () => void; data: PowerReport | null; loading: boolean; error: string | null;
  /** Whose logbook form: decides the source and formula boxes. */
  mill?: PowerMill;
}) {
  const mill = props.mill ?? 'hsm';
  // The card's period; only the grouping is chosen here.
  const r = useDrillRange(['selection'], 'selection');
  return (
    <DrillDrawer
      open={props.open}
      onClose={props.onClose}
      title="Power consumption · logbook"
      sub={`${mill.toUpperCase()} · kWh`}
      controls={r.controls}
      loading={props.loading}
      error={props.error}
      hasData={!!props.data}
    >
      {props.data && <Content data={props.data} grain={r.grain} mill={mill} />}
    </DrillDrawer>
  );
}

function Content({ data, grain, mill }: { data: PowerReport; grain: Grain; mill: PowerMill }) {
  const eq = data.equipment;
  const t = data.totals;
  const rows = useMemo(() => powerPeriods(data.days, grain), [data.days, grain]);
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => eq.map((e, i) => ({
    id: e, name: e, token: METER_TOKENS[i % METER_TOKENS.length], type: 'column', stack: 'kwh',
    data: rows.map((x) => x.byEquipment[e] ?? null), dp: 1,
  })), [eq, rows]);
  const axes = useMemo(() => [{ title: 'kWh', unit: 'kWh' }], []);

  return (
    <>
      <Stats items={[
        { label: 'Total', value: k(t.kwh), unit: 'kWh' },
        ...eq.map((e) => ({ label: e, value: k(t.byEquipment[e] ?? 0), unit: 'kWh' })),
      ]} />

      {t.entries > 0 ? (
        <DrillChart
          series={series}
          categories={categories}
          axes={axes}
          ariaLabel={`Power by period: ${rows.map((x) => `${x.label} ${k(x.kwh)} kWh`).join('; ')}`}
        />
      ) : (
        <p className="pd-empty">No logbook entries for this period.</p>
      )}

      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Power by period">
          <thead><tr><th>Period</th>{eq.map((e) => <th key={e} className="r">{e}</th>)}<th className="r">Total (kWh)</th></tr></thead>
          <tbody>{rows.map((x) => <Row key={x.key} r={x} eq={eq} />)}</tbody>
          <tfoot><tr><td>Total</td>{eq.map((e) => <td key={e} className="num r">{k(t.byEquipment[e] ?? 0)}</td>)}<td className="num r">{k(t.kwh)}</td></tr></tfoot>
        </table>
      </div>

      <Entries entries={data.entries} />

      <SourceBox sources={SOURCES[mill]} formula={FORMULA[mill]} />
      {data.logbook.connection === 'down' && <p className="v-warn">{data.logbook.message}</p>}
    </>
  );
}

function Row({ r, eq }: { r: PowerPeriod; eq: string[] }) {
  return (
    <tr>
      <td><b>{r.label}</b>{r.fromDate !== r.toDate && <span className="pd-dim"> · {dm(r.fromDate)}–{dm(r.toDate)}</span>}</td>
      {eq.map((e) => <td key={e} className="num r">{k(r.byEquipment[e])}</td>)}
      <td className="num r v-val"><b>{k(r.kwh)}</b></td>
    </tr>
  );
}

/** The entries of one date at a time, latest first — a stepper, not a long scroll. */
function Entries({ entries }: { entries: PowerEntry[] }) {
  const dates = useMemo(() => [...new Set(entries.map((e) => e.date))].sort().reverse(), [entries]);
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked && dates.includes(picked) ? picked : dates[0];
  if (!date) return null;
  const i = dates.indexOf(date);
  const shown = entries.filter((e) => e.date === date);

  return (
    <>
      <div className="pd-entries-head">
        <h3 className="pd-h">Entries · as filled</h3>
        <div className="tb-seg" role="group" aria-label="Entries date">
          <button type="button" className="tb-seg-btn pd-seg" aria-label="Earlier date" disabled={i === dates.length - 1} onClick={() => setPicked(dates[i + 1])}>‹</button>
          <span className="pd-entries-date" aria-live="polite">{dm(date)} · {shown.length}</span>
          <button type="button" className="tb-seg-btn pd-seg" aria-label="Later date" disabled={i === 0} onClick={() => setPicked(dates[i - 1])}>›</button>
        </div>
      </div>
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Logbook power entries">
          <thead><tr><th>Meter</th><th className="r">Previous reading</th><th className="r">Present reading</th><th className="r">Power consumed (kWh)</th></tr></thead>
          <tbody>
            {shown.map((e, j) => (
              <tr key={`${e.enteredAt}-${e.equipment}-${j}`}>
                <td>{e.equipment}</td>
                <td className="num r">{fmtNum(e.previousReading, 3)}</td>
                <td className="num r">{fmtNum(e.presentReading, 3)}</td>
                <td className="num r v-val">{e.kwh === null ? '—' : fmtNum(e.kwh, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const SOURCES: Record<PowerMill, SourceSystem[]> = {
  hsm: [{
    name: 'Logbook',
    rows: [
      ['Form', 'Electrical HSM → Power Consumption'],
      ['Field', 'POWER_CONSUMED (kWh), per equipment'],
      ['Date', "the form's date, as entered"],
    ],
  }],
  rmd: [{
    name: 'Logbook',
    rows: [
      ['Form', 'TMT Electrical Department → Power Reading VCB 1, VCB 2, VCB 3'],
      ['Field', 'ACTUAL_KWH_VCB_1, ACTUAL_KWH_VCB_2, ACTUAL_KWH_VCB_3 (kWh)'],
      ['Date', "the form's date, as entered"],
    ],
  }],
  lsm: [{
    name: 'Logbook',
    rows: [
      ['Form', 'Electrical Logbook → Daily Power Consumption Record (hourly)'],
      ['Field', 'ACTUAL_KWH_VCB_1_1250AMP (kWh)'],
      ['Date', "the form's date, as entered"],
    ],
  }],
  rms: [{
    name: 'Logbook',
    rows: [
      ['Form', 'Rolling Mill Structure (RMS) → RMS Electrical Logbook → Daily Power Consumption Record'],
      ['Field', 'ACTUAL_KWH_VCB_1_1250AMP (kWh)'],
      ['Date', "the form's date, as entered"],
    ],
  }],
};

const FORMULA: Record<PowerMill, string[]> = {
  hsm: [
    'Power (kWh) = Σ POWER_CONSUMED of every entry dated in the period, all meters',
    'Power (MWh) = Power (kWh) ÷ 1000',
  ],
  rmd: [
    'Power (kWh) = Σ ACTUAL_KWH_VCB_n of every entry dated in the period, VCB 1 + 2 + 3',
    'Power (MWh) = Power (kWh) ÷ 1000',
  ],
  lsm: [
    'Power (kWh) = Σ ACTUAL_KWH_VCB_1_1250AMP of every entry dated in the period',
    'ACTUAL_KWH = PRESENT_KWH − PREVIOUS_KWH (VCB-1, 1250 A)',
    'Power (MWh) = Power (kWh) ÷ 1000',
  ],
  rms: [
    'Power (kWh) = Σ ACTUAL_KWH_VCB_1_1250AMP of every entry dated in the period',
    'ACTUAL_KWH = PRESENT_KWH − PREVIOUS_KWH (VCB-1, 1250 A)',
    'Power (MWh) = Power (kWh) ÷ 1000',
  ],
};
