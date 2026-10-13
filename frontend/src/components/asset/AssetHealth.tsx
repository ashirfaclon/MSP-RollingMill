'use client';

/**
 * HSM · Asset Health — the layout of the approved mock-up (HSM_Asset_Health_Dashboard.png).
 * Wired where a source exists; NA everywhere else, never a sample figure:
 *   Mimic + status       roughing / finishing: live stand on/off (Influx On_Off, per stand);
 *   Motor current        average live Motor_Current of the selected group's running stands, A;
 *   Run hours            hours the mill ran over the period (Dicharged_Billet ≤ 10 min apart);
 *   MTTR                 the logbook's Electrical Delays: delay time ÷ faults, selected group;
 *   Diagnosis            the selected group's latest electrical fault, as written;
 *   Asset stop           ERP log sheet DELAY_HRS over the period (whole mill).
 * Clicking a zone selects its drive group; MTTR opens the faults behind it.
 */
import { Fragment, useState } from 'react';
import Panel from '@/components/Panel';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import FlowArrow from '@/components/visualization/FlowArrow';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import SourceBox from '@/components/drill/SourceBox';
import { fixed } from '@/lib/num';
import { dm, useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type ElectricalDelaysReport, type HsmLive, type RunningRateReport } from '@/services/hsmApi';
import '@/components/visualization/visualization.css';
import '@/components/rmd/rmd.css';
import './asset.css';

const GROUPS = ['Billet infeed', 'Roughing group', 'Intermediate group', 'Finishing group', 'Finished exit'] as const;
type Group = (typeof GROUPS)[number];
/** The zones that are drive groups with live stands. */
const LIVE: Partial<Record<Group, 'roughing' | 'finishing'>> = { 'Roughing group': 'roughing', 'Finishing group': 'finishing' };

const NA_CARDS: { label: string; unit: string; series: Series }[] = [
  { label: 'Vibration RMS', unit: 'mm/s', series: 'hold' },
  { label: 'Bearing temp', unit: '°C', series: 'hold' },
];
const NA_CARDS_2: { label: string; unit: string; series: Series }[] = [
  { label: 'Alignment', unit: 'mm', series: 'order' },
  { label: 'Gearbox oil', unit: '', series: 'hold' },
  { label: 'VFD trips', unit: 'per 100 run h', series: 'hold' },
];

export default function AssetHealth() {
  const [group, setGroup] = useState<Group>('Finishing group');
  const [faultsOpen, setFaultsOpen] = useState(false);
  const drive = group.replace(/ group$/, '');
  const gid = LIVE[group] ?? null;
  const { dates } = useSelection();

  const live = useApi<HsmLive>('/api/hsm/live', 30_000).data;
  const rateUrl = rangeUrl('/api/hsm/running-rate', dates ? { ...dates, grain: 'day' } : null);
  const rate = useApi<RunningRateReport>(rateUrl);
  const run = rate.data && rate.dataUrl === rateUrl ? rate.data.totals : null;
  const delaysUrl = rangeUrl('/api/hsm/electrical-delays', dates);
  const del = useApi<ElectricalDelaysReport>(delaysUrl);
  const delays = del.data && del.dataUrl === delaysUrl ? del.data : null;

  const groupLive = gid && live ? live.groups.find((g) => g.id === gid) ?? null : null;
  const running = gid && live ? live.stands.filter((s) => s.group === gid && s.fresh && s.on && s.currentA !== null) : [];
  const currentA = running.length ? running.reduce((a, s) => a + s.currentA!, 0) / running.length : null;
  const mine = gid && delays ? delays.delays.filter((d) => d.group === gid || d.group === 'both') : [];
  const mttr = gid && delays ? delays.totals[gid].mttrMin : null;
  const latest = mine[0] ?? null;

  return (
    <div className="rm-viz ah">
      <Panel className="ah-asset" bodyClass="ah-asset-body">
        <div className="ah-asset-id">
          <span className="rm-k">Selected asset</span>
          <h2 className="ah-asset-name">HSM · {drive} drive group</h2>
          <span className="ah-asset-path">Motor → coupling → gearbox → rolling zone</span>
        </div>
        {groupLive
          ? <span className={`chip ${groupLive.state === 'no-data' ? 'chip--na' : 'chip--info'} ah-status`}>{groupLive.stateLabel}</span>
          : <span className="chip chip--na ah-status">Status NA</span>}
        <dl className="ah-asset-facts">
          <Fact k="Last inspection" />
          <Fact k="Next PM · ERP" />
          <Fact k="Open work orders" />
          <Fact k="Health score" />
        </dl>
      </Panel>

      <section className="rm-strip ah-strip" aria-label="Condition KPIs">
        {NA_CARDS.map((c) => <KpiCard key={c.label} label={c.label} value="NA" unit={c.unit} note="" series={c.series} />)}
        <KpiCard label="Motor current" value={currentA === null ? 'NA' : fixed(currentA, 0)} unit="A" note="" series="prod" />
        {NA_CARDS_2.map((c) => <KpiCard key={c.label} label={c.label} value="NA" unit={c.unit} note="" series={c.series} />)}
        <KpiCard label="Run hours" value={run?.runH == null ? 'NA' : fixed(run.runH, 1)} unit="h" note="" series="prod" />
        <KpiCard label="PM on time" value="NA" unit="%" note="" series="order" />
      </section>

      <Panel title="Grouped asset mimic" sub="Select a group to inspect its motor, coupling, gearbox, bearings and associated records">
        <ol className="rm-mimic rmd-mimic" aria-label="Drive groups">
          {GROUPS.map((g, i) => {
            const gl = LIVE[g] && live ? live.groups.find((x) => x.id === LIVE[g]) ?? null : null;
            const value = gl && gl.state !== 'no-data' ? `${gl.on} of ${gl.total} on` : 'NA';
            return (
              <Fragment key={g}>
                {i > 0 && <li className="rm-mimic-arrow" aria-hidden><FlowArrow /></li>}
                <li className="rm-mimic-cell">
                  <button
                    type="button"
                    className={`rm-zone rm-zone--flow ah-zone${g === group ? ' is-selected' : ''}`}
                    aria-pressed={g === group}
                    onClick={() => setGroup(g)}
                  >
                    <span className="rm-zone-title">{g}</span>
                    <span className="rm-zone-body"><span className={`rm-zone-value num ${value === 'NA' ? 'v-na' : 'v-val'}`}>{value}</span></span>
                  </button>
                </li>
              </Fragment>
            );
          })}
        </ol>
      </Panel>

      <div className="rm-row">
        <Panel title="Condition trends" sub="Last seven inspection rounds" className="rm-panel" bodyClass="rm-body ah-trends">
          <Trend label="Vibration · mm/s RMS" />
          <Trend label="Bearing temp · °C" />
        </Panel>
        <Panel title="Laser alignment · Machine inspection" className="rm-panel" bodyClass="rm-body ah-pair">
          <Figure k="As-found" sub="Offset | angle" />
          <Figure k="As-left" sub="Offset | angle" />
        </Panel>
      </div>

      <div className="rm-row">
        <Panel title="ERP PM & work-order history" className="rm-panel" bodyClass="rm-body ah-list">
          <Row k="PM completed on time" />
          <Row k="MTBF" />
          {gid && delays ? (
            <button type="button" className="ah-row ah-row--button" onClick={() => setFaultsOpen(true)} aria-haspopup="dialog">
              <span className="rm-k">MTTR</span>
              <span className={`num ${mttr === null ? 'v-na' : 'v-val'}`}>{mttr === null ? 'NA' : `${fixed(mttr, 1)} min`}</span>
            </button>
          ) : <Row k="MTTR" />}
          <Row k="Open action" />
        </Panel>
        <Panel title="Diagnosis & process impact" className="rm-panel" bodyClass="rm-body ah-list">
          <div className="ah-row">
            <span className="rm-k">Diagnosis</span>
            {latest
              ? <span className="ah-diag">{latest.details} <span className="pd-dim">· {dm(latest.date)}</span></span>
              : <span className="num v-na">NA</span>}
          </div>
          <Row k="Asset stop" v={run?.erpDelayH == null ? null : `${fixed(run.erpDelayH, 1)} h`} />
          <Row k="Output effect" />
          <Row k="Value" />
        </Panel>
      </div>

      <DrillDrawer
        open={faultsOpen}
        onClose={() => setFaultsOpen(false)}
        title={`${drive} · electrical faults`}
        sub="HSM · logbook"
        loading={!delays}
        error={del.error}
        hasData={!!delays}
      >
        {delays && gid && (
          <>
            <Stats items={[
              { label: 'Faults', value: String(delays.totals[gid].faults), unit: '' },
              { label: 'Delay time', value: fixed(delays.totals[gid].minutes, 0), unit: 'min' },
              { label: 'MTTR', value: mttr === null ? 'NA' : fixed(mttr, 1), unit: 'min' },
            ]} />
            <div className="pd-table-wrap">
              <table className="grid pd-table" aria-label="Electrical faults">
                <thead><tr><th>Date</th><th>Shift</th><th>Stands</th><th className="r">Minutes</th><th>Fault details</th></tr></thead>
                <tbody>
                  {mine.map((d, i) => (
                    <tr key={i}>
                      <td><b>{dm(d.date)}</b></td>
                      <td>{d.shift}</td>
                      <td>{d.stands.join(', ') || '—'}</td>
                      <td className="num r">{d.minutes === null ? '—' : fixed(d.minutes, 0)}</td>
                      <td>{d.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SourceBox
              sources={[{ name: 'Logbook', rows: [
                ['Form', 'Electrical HSM → Electrical Delays'],
                ['Field', 'FAULT_DETAILS, DURATION, by the form\'s date'],
                ['Group', `stands named in the fault: ${gid === 'roughing' ? 'R1–R5' : 'F1–F6'}`],
              ] }]}
              formula={['MTTR = Σ DURATION ÷ faults with a duration']}
            />
          </>
        )}
      </DrillDrawer>
    </div>
  );
}

function Fact({ k }: { k: string }) {
  return (
    <div className="ah-fact">
      <dt className="rm-k">{k}</dt>
      <dd className="num v-na">NA</dd>
    </div>
  );
}

function Trend({ label }: { label: string }) {
  return (
    <div className="ah-trend">
      <div className="ah-trend-head"><span className="rm-k">{label}</span><span className="num v-na">NA</span></div>
      <div className="ah-trend-plot" role="img" aria-label={`${label}: no data`} />
    </div>
  );
}

function Figure({ k, sub }: { k: string; sub: string }) {
  return (
    <div className="ah-figure">
      <span className="rm-k">{k}</span>
      <span className="ah-figure-v num v-na">NA</span>
      <span className="ah-figure-sub">{sub} <b className="v-na">NA</b></span>
    </div>
  );
}

function Row({ k, v = null }: { k: string; v?: string | null }) {
  return (
    <div className="ah-row">
      <span className="rm-k">{k}</span>
      <span className={`num ${v === null ? 'v-na' : 'v-val'}`}>{v ?? 'NA'}</span>
    </div>
  );
}
