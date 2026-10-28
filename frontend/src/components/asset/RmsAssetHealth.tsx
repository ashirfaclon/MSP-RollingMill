'use client';

/**
 * RMS · Asset Health — HSM's layout, wired only from the sources the RMS sheet names (R.M.S.xlsx,
 * Asset Health; the user, 26 Oct 2026):
 *   Run hours      ERP log sheet NET_RUNNING_HRS over the period (division RS, series L5P).
 * Everything else is NA: bearing temp, motor current, gearbox oil, PM on time, MTBF and MTTR come
 * from an "offline sheet" (not in any system we read); vibration from MID. No mill mimic on RMS
 * (the user, 23 Oct 2026). No VFD trips card on any mill (the user, 28 Oct 2026).
 */
import { useState } from 'react';
import Panel from '@/components/Panel';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import { fixed } from '@/lib/num';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmsProductionReport } from '@/services/hsmApi';
import '@/components/visualization/visualization.css';
import { useMid } from './useMid';
import { MidVibrationDrawer, MidVibrationTrend, midDate, MidRemarks } from './MidVibration';
import { ErpPmDrawer, ErpPmRows, PmOnTimeCard, pmFacts, usePm } from './ErpPm';
import './asset.css';

const NA = (label: string, unit: string, series: Series) => <KpiCard key={label} label={label} value="NA" unit={unit} note="" series={series} />;

export default function RmsAssetHealth() {
  const { dates } = useSelection();
  const [vibOpen, setVibOpen] = useState(false);
  const mid = useMid('rms', 'all');
  const pm = usePm('rms');
  const pmFact = pmFacts(pm);
  const [pmOpen, setPmOpen] = useState(false);
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
          {([['Last inspection', midDate(mid.date)], ['Next PM · ERP', pmFact.nextPm], ['Open work orders', pmFact.openWorkOrders]] as const).map(([k, v]) => (
            <div className="ah-fact" key={k}><dt className="rm-k">{k}</dt><dd className={`num ${v ? 'v-val' : 'v-na'}`}>{v ?? 'NA'}</dd></div>
          ))}
        </dl>
      </Panel>

      <section className="rm-strip ah-strip" aria-label="Condition KPIs">
        <KpiCard label="Vibration RMS" value={mid.maxMmS === null ? 'NA' : fixed(mid.maxMmS, 1)} unit="mm/s" note="" series="hold" noEntries={!!mid.report && mid.maxMmS === null}
          {...(mid.machines.length ? { onOpen: () => setVibOpen(true), openLabel: 'Each machine at the last MID visit' } : {})} />
        <MidVibrationDrawer open={vibOpen} onClose={() => setVibOpen(false)} title="RMS · mill" mid={mid} />
        {NA('Bearing temp', '°C', 'hold')}
        {NA('Motor current', 'A', 'prod')}
        {NA('Gearbox oil', '', 'hold')}
        <KpiCard label="Run hours" value={runH == null ? 'NA' : fixed(runH, 1)} unit="h" note="" series="prod" loading={!prodS.data && !prodS.error}
          noEntries={!!prodS.data && prodS.dataUrl === url && runH == null} />
        <PmOnTimeCard pm={pm} onOpen={() => setPmOpen(true)} />
        <ErpPmDrawer open={pmOpen} onClose={() => setPmOpen(false)} pm={pm} runH={runH} title="RMS" />
      </section>

      <div className="rm-row ah-row--one">
        <Panel title="Condition trends" className="rm-panel" bodyClass="rm-body ah-trends">
          <MidVibrationTrend mid={mid} />
          <div className="ah-trend">
            <div className="ah-trend-head"><span className="rm-k">Bearing temp · °C</span><span className="num v-na">NA</span></div>
            <div className="ah-trend-plot" role="img" aria-label="Bearing temp · °C: no data" />
          </div>
        </Panel>
      </div>

      <div className="rm-row">
        <Panel title="ERP PM & work-order history" className="rm-panel" bodyClass="rm-body ah-list">
          <ErpPmRows pm={pm} runH={runH} onOpen={() => setPmOpen(true)} />
        </Panel>
        <Panel title="Remarks" className="rm-panel" bodyClass="rm-body ah-list ah-list--top">
          <MidRemarks mid={mid} />
        </Panel>
      </div>
    </div>
  );
}
