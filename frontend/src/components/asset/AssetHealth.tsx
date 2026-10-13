'use client';

/**
 * HSM · Asset Health — the layout of the approved mock-up (HSM_Asset_Health_Dashboard.png):
 * the selected drive group, its condition cards, the grouped asset mimic, condition trends,
 * the last laser alignment, ERP PM / work-order history, and diagnosis & process impact.
 *
 * No source is confirmed for any of it yet, so every figure is NA — never a sample number.
 * A zone's status (e.g. "Review asset") comes from data, so no zone is flagged. Clicking a
 * zone selects its drive group for the top section. Each piece is wired as its source is given.
 */
import { Fragment, useState } from 'react';
import Panel from '@/components/Panel';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import FlowArrow from '@/components/visualization/FlowArrow';
import '@/components/visualization/visualization.css';
import '@/components/rmd/rmd.css';
import './asset.css';

const GROUPS = ['Billet infeed', 'Roughing group', 'Intermediate group', 'Finishing group', 'Finished exit'] as const;
type Group = (typeof GROUPS)[number];

const CARDS: { label: string; unit: string; series: Series }[] = [
  { label: 'Vibration RMS', unit: 'mm/s', series: 'hold' },
  { label: 'Bearing temp', unit: '°C', series: 'hold' },
  { label: 'Motor current', unit: '%', series: 'prod' },
  { label: 'Alignment', unit: 'mm', series: 'order' },
  { label: 'Gearbox oil', unit: '', series: 'hold' },
  { label: 'VFD trips', unit: 'per 100 run h', series: 'hold' },
  { label: 'Run hours', unit: 'h', series: 'prod' },
  { label: 'PM on time', unit: '%', series: 'order' },
];

export default function AssetHealth() {
  const [group, setGroup] = useState<Group>('Finishing group');
  const drive = group.replace(/ group$/, '');

  return (
    <div className="rm-viz ah">
      <Panel className="ah-asset" bodyClass="ah-asset-body">
        <div className="ah-asset-id">
          <span className="rm-k">Selected asset</span>
          <h2 className="ah-asset-name">HSM · {drive} drive group</h2>
          <span className="ah-asset-path">Motor → coupling → gearbox → rolling zone</span>
        </div>
        <span className="chip chip--na ah-status">Status NA</span>
        <dl className="ah-asset-facts">
          <Fact k="Last inspection" />
          <Fact k="Next PM · ERP" />
          <Fact k="Open work orders" />
          <Fact k="Health score" />
        </dl>
      </Panel>

      <section className="rm-strip ah-strip" aria-label="Condition KPIs">
        {CARDS.map((c) => <KpiCard key={c.label} label={c.label} value="NA" unit={c.unit} note="" series={c.series} />)}
      </section>

      <Panel title="Grouped asset mimic" sub="Select a group to inspect its motor, coupling, gearbox, bearings and associated records">
        <ol className="rm-mimic rmd-mimic" aria-label="Drive groups">
          {GROUPS.map((g, i) => (
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
                  <span className="rm-zone-body"><span className="rm-zone-value num v-na">NA</span></span>
                </button>
              </li>
            </Fragment>
          ))}
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
          <Row k="MTTR" />
          <Row k="Open action" />
        </Panel>
        <Panel title="Diagnosis & process impact" className="rm-panel" bodyClass="rm-body ah-list">
          <Row k="Diagnosis" />
          <Row k="Asset stop" />
          <Row k="Output effect" />
          <Row k="Value" />
        </Panel>
      </div>
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

function Row({ k }: { k: string }) {
  return (
    <div className="ah-row">
      <span className="rm-k">{k}</span>
      <span className="num v-na">NA</span>
    </div>
  );
}
