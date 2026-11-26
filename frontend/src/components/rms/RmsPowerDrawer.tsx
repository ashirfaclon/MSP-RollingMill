'use client';

/**
 * RMS power drill-down (the user, 26 Nov 2026), from the RMS Daily Power Consumption Record as updated: three views of
 * the one form, switched at the top —
 *   sharing   what came in through VCB-1 + VCB-2 and where it went: RMS itself, the HSM share, the crusher, the colony;
 *   meters    VCB-1 against VCB-2, kWh and kVAh;
 *   pf        power factor = kWh ÷ kVAh, each meter and the two together.
 * An entry of the old form (to 22 Nov 2026) has VCB-1 only and no sharing: shown as the meter reading it is, in its own
 * colour, never as "RMS power". Nothing is corrected — a wrong figure shows as entered.
 */
import { useMemo, useState } from 'react';
import DrillDrawer, { Seg, Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox, { type SourceSystem } from '@/components/drill/SourceBox';
import { useDrillRange } from '@/components/drill/useDrillRange';
import { powerPeriods, type PowerPeriod } from '@/components/drill/powerPeriods';
import { dm } from '@/services/hsmProduction';
import type { Grain } from '@contracts';
import type { PowerReport, RmsPowerSplit } from '@/services/hsmApi';

export type RmsPowerView = 'sharing' | 'meters' | 'pf';

const VIEWS: { id: RmsPowerView; label: string; title: string }[] = [
  { id: 'sharing', label: 'Power sharing', title: 'What came in and where it went: RMS, HSM share, crusher, colony' },
  { id: 'meters', label: 'VCB-1 vs VCB-2', title: 'Each meter, kWh and kVAh' },
  { id: 'pf', label: 'Power factor', title: 'kWh ÷ kVAh, each meter and both together' },
];

const k = (v: number | null | undefined) => (v === null || v === undefined ? '—' : fmtNum(v, 1));
const pf = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(2));
const pct = (a: number | null | undefined, b: number | null | undefined) => (a === null || a === undefined || !b ? '—' : `${fmtNum((a / b) * 100, 1)} %`);

export default function RmsPowerDrawer(props: {
  open: boolean; onClose: () => void; data: PowerReport | null; loading: boolean; error: string | null;
  /** The view the card opens on. */
  view?: RmsPowerView;
}) {
  const r = useDrillRange(['selection'], 'selection');
  const [picked, setPicked] = useState<RmsPowerView | null>(null);
  const view = picked ?? props.view ?? 'sharing';
  return (
    <DrillDrawer
      open={props.open}
      onClose={() => { setPicked(null); props.onClose(); }}
      title="Power · logbook"
      sub={view === 'pf' ? 'RMS · kWh ÷ kVAh' : 'RMS · kWh'}
      controls={<><Seg label="Power view" value={view} onChange={setPicked} options={VIEWS} />{r.controls}</>}
      loading={props.loading}
      error={props.error}
      hasData={!!props.data}
    >
      {props.data && <Content data={props.data} grain={r.grain} view={view} />}
    </DrillDrawer>
  );
}

type Row = PowerPeriod & { rms: RmsPowerSplit };

function Content({ data, grain, view }: { data: PowerReport; grain: Grain; view: RmsPowerView }) {
  const rows = useMemo(() => powerPeriods(data.days, grain).filter((x): x is Row => !!x.rms), [data.days, grain]);
  const t = data.totals.rms;
  if (!t) return null;
  const empty = data.totals.entries === 0;
  return (
    <>
      {view === 'sharing' ? <Sharing rows={rows} t={t} empty={empty} />
        : view === 'meters' ? <Meters rows={rows} t={t} empty={empty} />
        : <Factor rows={rows} t={t} empty={empty} />}
      <SourceBox sources={SOURCES[view]} formula={FORMULA[view]} />
      {data.logbook.connection === 'down' && <p className="v-warn">{data.logbook.message}</p>}
    </>
  );
}

const Period = ({ r }: { r: PowerPeriod }) => (
  <td><b>{r.label}</b>{r.fromDate !== r.toDate && <span className="pd-dim"> · {dm(r.fromDate)}–{dm(r.toDate)}</span>}</td>
);
const Empty = () => <p className="pd-empty">No logbook entries for this period.</p>;

/** What came in and where it went. */
function Sharing({ rows, t, empty }: { rows: Row[]; t: RmsPowerSplit; empty: boolean }) {
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const old = t.meterOnlyKwh !== null;
  const series = useMemo<DrillSeries[]>(() => {
    const col = (id: string, name: string, token: string, key: keyof RmsPowerSplit): DrillSeries => (
      { id, name, token, type: 'column', stack: 'kwh', data: rows.map((x) => x.rms[key]), dp: 1 });
    return [
      col('rms', 'RMS', '--s-prod', 'rmsKwh'),
      col('hsm', 'HSM share', '--s-order', 'hsmShareKwh'),
      col('crusher', 'Crusher', '--s-free', 'crusherKwh'),
      col('colony', 'Colony', '--cat-5', 'colonyKwh'),
      ...(old ? [col('meter', 'VCB-1 reading · not shared out', '--cat-6', 'meterOnlyKwh')] : []),
    ];
  }, [rows, old]);
  const axes = useMemo(() => [{ title: 'kWh', unit: 'kWh' }], []);
  return (
    <>
      <Stats items={[
        { label: 'RMS power', value: k(t.rmsKwh), unit: 'kWh', title: 'Total − HSM share − crusher − colony' },
        { label: 'HSM share', value: k(t.hsmShareKwh), unit: 'kWh' },
        { label: 'Crusher', value: k(t.crusherKwh), unit: 'kWh' },
        { label: 'Colony', value: k(t.colonyKwh), unit: 'kWh' },
        { label: 'Total drawn', value: k(t.totalKwh), unit: 'kWh', title: 'VCB-1 + VCB-2' },
        ...(old ? [{ label: 'Of it, VCB-1 reading only', value: k(t.meterOnlyKwh), unit: 'kWh', title: 'Entries of the old form: VCB-1 only, sharing not recorded' }] : []),
      ]} />
      {empty ? <Empty /> : (
        <DrillChart series={series} categories={categories} axes={axes}
          ariaLabel={`Power sharing by period: ${rows.map((x) => `${x.label} total ${k(x.rms.totalKwh)} kWh, RMS ${k(x.rms.rmsKwh)}`).join('; ')}`} />
      )}
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Power sharing by period">
          <thead><tr><th>Period</th><th className="r">Total drawn (kWh)</th><th className="r">HSM share</th><th className="r">Crusher</th><th className="r">Colony</th><th className="r">RMS power (kWh)</th><th className="r">RMS share</th></tr></thead>
          <tbody>{rows.map((x) => <SharingRow key={x.key} x={x} s={x.rms} />)}</tbody>
          <tfoot><SharingRow s={t} /></tfoot>
        </table>
      </div>
      {old && <p className="pd-dim pd-foot-note">— under the shares: an entry of the old form (to 22 Nov 2026), VCB-1 only — sharing was not recorded.</p>}
    </>
  );
}

function SharingRow({ x, s }: { x?: Row; s: RmsPowerSplit }) {
  const sharedIn = s.rmsKwh === null ? null : (s.totalKwh ?? 0) - (s.meterOnlyKwh ?? 0);
  return (
    <tr>
      {x ? <Period r={x} /> : <td>Total</td>}
      <td className="num r">{k(s.totalKwh)}</td>
      <td className="num r">{k(s.hsmShareKwh)}</td>
      <td className="num r">{k(s.crusherKwh)}</td>
      <td className="num r">{k(s.colonyKwh)}</td>
      <td className="num r v-val"><b>{k(s.rmsKwh)}</b></td>
      <td className="num r">{pct(s.rmsKwh, sharedIn)}</td>
    </tr>
  );
}

/** VCB-1 against VCB-2. */
function Meters({ rows, t, empty }: { rows: Row[]; t: RmsPowerSplit; empty: boolean }) {
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'vcb1', name: 'VCB-1', token: '--s-prod', type: 'column', stack: 'kwh', data: rows.map((x) => x.rms.vcb1Kwh), dp: 1 },
    { id: 'vcb2', name: 'VCB-2', token: '--s-order', type: 'column', stack: 'kwh', data: rows.map((x) => x.rms.vcb2Kwh), dp: 1 },
  ], [rows]);
  const axes = useMemo(() => [{ title: 'kWh', unit: 'kWh' }], []);
  return (
    <>
      <Stats items={[
        { label: 'VCB-1', value: k(t.vcb1Kwh), unit: 'kWh' },
        { label: 'VCB-2', value: k(t.vcb2Kwh), unit: 'kWh' },
        { label: 'Total drawn', value: k(t.totalKwh), unit: 'kWh' },
        { label: 'VCB-1 share', value: pct(t.vcb1Kwh, t.totalKwh) },
        { label: 'VCB-2 share', value: pct(t.vcb2Kwh, t.totalKwh) },
      ]} />
      {empty ? <Empty /> : (
        <DrillChart series={series} categories={categories} axes={axes}
          ariaLabel={`VCB-1 and VCB-2 by period: ${rows.map((x) => `${x.label} VCB-1 ${k(x.rms.vcb1Kwh)}, VCB-2 ${k(x.rms.vcb2Kwh)} kWh`).join('; ')}`} />
      )}
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="VCB-1 and VCB-2 by period">
          <thead><tr><th>Period</th><th className="r">VCB-1 (kWh)</th><th className="r">VCB-2 (kWh)</th><th className="r">Total (kWh)</th><th className="r">VCB-1 (kVAh)</th><th className="r">VCB-2 (kVAh)</th></tr></thead>
          <tbody>{rows.map((x) => <MetersRow key={x.key} x={x} s={x.rms} />)}</tbody>
          <tfoot><MetersRow s={t} /></tfoot>
        </table>
      </div>
    </>
  );
}

function MetersRow({ x, s }: { x?: Row; s: RmsPowerSplit }) {
  return (
    <tr>
      {x ? <Period r={x} /> : <td>Total</td>}
      <td className="num r">{k(s.vcb1Kwh)}</td>
      <td className="num r">{k(s.vcb2Kwh)}</td>
      <td className="num r v-val"><b>{k(s.totalKwh)}</b></td>
      <td className="num r">{k(s.vcb1Kvah)}</td>
      <td className="num r">{k(s.vcb2Kvah)}</td>
    </tr>
  );
}

/** Power factor. */
function Factor({ rows, t, empty }: { rows: Row[]; t: RmsPowerSplit; empty: boolean }) {
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'pf', name: 'VCB-1 + VCB-2', token: '--s-pred', type: 'line', data: rows.map((x) => x.rms.pf), dp: 2 },
    { id: 'pf1', name: 'VCB-1', token: '--s-prod', type: 'line', dashed: true, data: rows.map((x) => x.rms.pf1), dp: 2 },
    { id: 'pf2', name: 'VCB-2', token: '--s-order', type: 'line', dashed: true, data: rows.map((x) => x.rms.pf2), dp: 2 },
  ], [rows]);
  const axes = useMemo(() => [{ title: 'Power factor', unit: '' }], []);
  return (
    <>
      <Stats items={[
        { label: 'Power factor', value: pf(t.pf), title: 'VCB-1 + VCB-2: Σ kWh ÷ Σ kVAh' },
        { label: 'VCB-1', value: pf(t.pf1) },
        { label: 'VCB-2', value: pf(t.pf2) },
      ]} />
      {empty ? <Empty /> : (
        <DrillChart series={series} categories={categories} axes={axes}
          ariaLabel={`Power factor by period: ${rows.map((x) => `${x.label} ${pf(x.rms.pf)}`).join('; ')}`} />
      )}
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Power factor by period">
          <thead><tr><th>Period</th><th className="r">VCB-1</th><th className="r">VCB-2</th><th className="r">VCB-1 + VCB-2</th></tr></thead>
          <tbody>{rows.map((x) => <FactorRow key={x.key} x={x} s={x.rms} />)}</tbody>
          <tfoot><FactorRow s={t} /></tfoot>
        </table>
      </div>
    </>
  );
}

function FactorRow({ x, s }: { x?: Row; s: RmsPowerSplit }) {
  return (
    <tr>
      {x ? <Period r={x} /> : <td>Total</td>}
      <td className="num r">{pf(s.pf1)}</td>
      <td className="num r">{pf(s.pf2)}</td>
      <td className="num r v-val"><b>{pf(s.pf)}</b></td>
    </tr>
  );
}

const FORM: [string, string] = ['Form', 'Rolling Mill Structure (RMS) → RMS Electrical Logbook → Daily Power Consumption Record'];
const DATE: [string, string] = ['Date', "the form's date, as entered"];
const SOURCES: Record<RmsPowerView, SourceSystem[]> = {
  sharing: [{ name: 'Logbook', rows: [FORM, ['Field', 'TOTAL ACTUAL KWH, TOTAL HSM SHARE (KWH), TOTAL CRUSHER (KWH), TOTAL COLONY (KWH), TOTAL RMS ACTUAL POWER KWH'], DATE] }],
  meters: [{ name: 'Logbook', rows: [FORM, ['Field', 'VCB-1 ACTUAL KWH / KVAH, VCB-2 ACTUAL KWH / KVAH'], DATE] }],
  pf: [{ name: 'Logbook', rows: [FORM, ['Field', 'VCB-1 ACTUAL KWH / KVAH, VCB-2 ACTUAL KWH / KVAH'], DATE] }],
};
const FORMULA: Record<RmsPowerView, string[]> = {
  sharing: [
    'Total drawn = VCB-1 + VCB-2',
    'RMS power = Total drawn − HSM share − Crusher − Colony',
  ],
  meters: ['Total drawn = VCB-1 + VCB-2'],
  pf: ['Power factor = kWh ÷ kVAh'],  // the kWh and kVAh behind it are in the VCB-1 vs VCB-2 view
};
