'use client';

/**
 * RMS · Asset Health — HSM's layout, wired only from the sources the RMS sheet names (R.M.S.xlsx,
 * Asset Health; the user, 26 Oct 2026):
 *   Run hours      ERP log sheet NET_RUNNING_HRS over the period (division RS, series L5P).
 * Everything else is NA: bearing temp, motor current, gearbox oil, PM on time, MTBF and MTTR come
 * from an "offline sheet" (not in any system we read); vibration and alignment wait on MID; VFD
 * trips are n/a. No mill mimic on RMS (the user, 23 Oct 2026).
 */
import { useState } from 'react';
import Panel from '@/components/Panel';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import { fixed } from '@/lib/num';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmsProductionReport } from '@/services/hsmApi';
import '@/components/visualization/visualization.css';
import { useMid } from './useMid';
import { MidVibrationDrawer, MidVibrationTrend, midDate } from './MidVibration';
import './asset.css';

const NA = (label: string, unit: string, series: Series) => <KpiCard key={label} label={label} value="NA" unit={unit} note="" series={series} />;
const Row = ({ k }: { k: string }) => <div className="ah-row"><span className="rm-k">{k}</span><span className="num v-na">NA</span></div>;

export default function RmsAssetHealth() {
  const { dates } = useSelection();
  const [vibOpen, setVibOpen] = useState(false);
  const mid = useMid('rms', 'all');
  const url = rangeUrl('/api/rms/production', dates ? { ...dates, grain: 'day' } : null);
  const prodS = useApi<RmsProductionReport>(url);
  const runH = prodS.data && prodS.dataUrl === url ? prodS.data.totals.runningHrs : null;

  return (
    <div className="rm-viz ah">
      <Panel className="ah-asset" bodyClass="ah-asset-body">
        <div className="ah-asset-id">
          <span className="rm-k">Selected asset</span>
          <h2 className="ah-asset-name">RMS · mill drives</h2>
        </div>
        <span className="chip chip--na ah-status">Status NA</span>
        <dl className="ah-asset-facts">
          {([['Last inspection', midDate(mid.date)], ['Next PM · ERP', null], ['Open work orders', null], ['Health score', null]] as const).map(([k, v]) => (
            <div className="ah-fact" key={k}><dt className="rm-k">{k}</dt><dd className={`num ${v ? 'v-val' : 'v-na'}`}>{v ?? 'NA'}</dd></div>
          ))}
        </dl>
      </Panel>

      <section className="rm-strip ah-strip" aria-label="Condition KPIs">
        <KpiCard label="Vibration RMS" value={mid.maxMmS === null ? 'NA' : fixed(mid.maxMmS, 1)} unit="mm/s" note="" series="hold"
          {...(mid.machines.length ? { onOpen: () => setVibOpen(true), openLabel: 'Each machine at the last MID visit' } : {})} />
        <MidVibrationDrawer open={vibOpen} onClose={() => setVibOpen(false)} title="RMS · mill" mid={mid} />
        {NA('Bearing temp', '°C', 'hold')}
        {NA('Motor current', 'A', 'prod')}
        {NA('Alignment', 'mm', 'order')}
        {NA('Gearbox oil', '', 'hold')}
        {NA('VFD trips', 'per 100 run h', 'hold')}
        <KpiCard label="Run hours" value={runH == null ? 'NA' : fixed(runH, 1)} unit="h" note="" series="prod" loading={!prodS.data && !prodS.error} />
        {NA('PM on time', '%', 'order')}
      </section>

      <div className="rm-row">
        <Panel title="Condition trends" className="rm-panel" bodyClass="rm-body ah-trends">
          <MidVibrationTrend mid={mid} />
          <div className="ah-trend">
            <div className="ah-trend-head"><span className="rm-k">Bearing temp · °C</span><span className="num v-na">NA</span></div>
            <div className="ah-trend-plot" role="img" aria-label="Bearing temp · °C: no data" />
          </div>
        </Panel>
        <Panel title="Laser alignment · Machine inspection" className="rm-panel" bodyClass="rm-body ah-pair">
          {['As-found', 'As-left'].map((k) => (
            <div className="ah-figure" key={k}>
              <span className="rm-k">{k}</span>
              <span className="ah-figure-v num v-na">NA</span>
              <span className="ah-figure-sub">Offset | angle <b className="v-na">NA</b></span>
            </div>
          ))}
        </Panel>
      </div>

      <div className="rm-row">
        <Panel title="ERP PM & work-order history" className="rm-panel" bodyClass="rm-body ah-list">
          {['PM completed on time', 'MTBF', 'MTTR', 'Open action'].map((k) => <Row key={k} k={k} />)}
        </Panel>
        <Panel title="Diagnosis & process impact" className="rm-panel" bodyClass="rm-body ah-list">
          <div className="ah-row">
            <span className="rm-k">Diagnosis</span>
            {mid.worst
              ? <span className="ah-diag">{mid.worst.status === 'Good' ? 'All machines Good (MID)' : `${mid.worst.status} · ${mid.worst.machine}${mid.worst.diagnosis ? `: ${mid.worst.diagnosis}` : ''}`}</span>
              : <span className="num v-na">NA</span>}
          </div>
          {['Asset stop', 'Output effect', 'Value'].map((k) => <Row key={k} k={k} />)}
        </Panel>
      </div>
    </div>
  );
}
