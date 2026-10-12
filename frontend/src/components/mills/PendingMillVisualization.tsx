'use client';

/**
 * Visualization for a mill whose sources are not confirmed yet (LSM, RMS): the same screen as
 * HSM and RMD — KPI strip, mill flow, then two rows of paired panels — with every figure NA.
 * Never a sample number. The KPI list follows the plant's Visualisation sheet for the mill
 * (LSM.xlsx / R.M.S.xlsx); each card and panel is wired once its source is confirmed.
 */
import { Fragment } from 'react';
import Panel from '@/components/Panel';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import FlowArrow from '@/components/visualization/FlowArrow';
import ShiftBars from '@/components/visualization/ShiftBars';
import '@/components/visualization/visualization.css';
import { DAY_START_HOUR, shiftsLabel } from '@/lib/plantDay';
import '@/components/rmd/rmd.css';

const CARDS: { label: string; unit: string; series: Series }[] = [
  { label: 'Production', unit: 'MT', series: 'prod' },
  { label: 'Mass yield', unit: '%', series: 'order' },
  { label: 'Power consumption', unit: 'MWh', series: 'prod' },
  { label: 'Specific energy', unit: 'kWh/MT', series: 'prod' },
  { label: 'Made To Stock', unit: 'MT', series: 'free' },
  { label: 'Stock with order', unit: 'MT', series: 'order' },
  { label: 'Free stock', unit: 'MT', series: 'free' },
];

/** The mill flow as the plant lists it: billet delivery, three stand groups, finish exit. */
const ZONES = ['Billet delivery rate', 'Roughing group', 'Intermediate group', 'Finishing group', 'Finish exit'];

const NA_SHIFT = { planMt: null, outputMt: null, compliancePct: null };

export default function PendingMillVisualization({ mill }: { mill: 'lsm' | 'rms' }) {
  return (
    <div className="rm-viz">
      <section className="rm-strip" aria-label="Headline KPIs">
        {CARDS.map((c) => <KpiCard key={c.label} label={c.label} value="NA" unit={c.unit} note="" series={c.series} />)}
      </section>

      <Panel title="Mill mimic">
        <ol className="rm-mimic rmd-mimic" aria-label="Mill process flow">
          {ZONES.map((z, i) => (
            <Fragment key={z}>
              {i > 0 && <li className="rm-mimic-arrow" aria-hidden><FlowArrow /></li>}
              <li className="rm-mimic-cell">
                <div className="rm-zone rm-zone--flow">
                  <span className="rm-zone-title">{z}</span>
                  <span className="rm-zone-body"><span className="rm-zone-value num v-na">NA</span></span>
                  <span className="rm-zone-foot">{' '}</span>
                </div>
              </li>
            </Fragment>
          ))}
        </ol>
      </Panel>

      <div className="rm-row">
        <ShiftBars
          shifts={[{ name: 'Day', ...NA_SHIFT }, { name: 'Night', ...NA_SHIFT }]}
          day={NA_SHIFT}
          planMt={null}
          planGapMt={null}
          sub={shiftsLabel(DAY_START_HOUR[mill])}
          rate={
            <span className="rm-foot-item">
              <span className="rm-k">Running rate</span>
              <span className="rm-foot-v num v-na">NA</span>
            </span>
          }
        />
        <Panel title="Order allocation" className="rm-panel" bodyClass="rm-body rm-alloc">
          <div className="rm-alloc-block">
            <div className="rm-alloc-head">
              <span className="rm-k">Production</span>
              <span className="rm-alloc-total num v-na">NA</span>
            </div>
            <div className="rm-legend">
              <span className="rmd-legend-item rm-tone--order"><i className="rm-dot" aria-hidden />Made To Order <b className="num v-na">NA</b></span>
              <span className="rmd-legend-item rm-tone--free"><i className="rm-dot" aria-hidden />Made To Stock <b className="num v-na">NA</b></span>
            </div>
          </div>
          <div className="rm-alloc-block">
            <div className="rm-alloc-head">
              <span className="rm-k">Finished stock</span>
              <span className="rm-alloc-total num v-na">NA</span>
            </div>
          </div>
        </Panel>
      </div>

      <div className="rm-row">
        <Panel title="Material & operating balance" className="rm-panel" bodyClass="rm-body">
          <div className="rm-mb">
            <div className="rm-mb-head">
              <Figure label="Billet input" />
              <Figure label="Yield" tone="order" end />
            </div>
            <span className="rm-mb-bar rm-mb-bar--input" role="img" aria-label="Billet input: not available yet" />
            <div className="rm-mb-labels">
              <span className="rm-mb-caption rm-tone--order">Finished <b className="num v-na">NA</b></span>
              <span className="rm-mb-caption rm-tone--diff">Mass difference <b className="num v-na">NA</b></span>
            </div>
            <div className="rmd-mb-pieces">
              <span className="rm-k">Billets</span>
              <span className="rm-mb-pieces-v num v-na">NA</span>
            </div>
          </div>
        </Panel>
        <Panel title="Finished stock by size" className="rm-panel" bodyClass="rm-body">
          <p className="rm-empty">NA</p>
        </Panel>
      </div>
    </div>
  );
}

function Figure(props: { label: string; tone?: Series; end?: boolean }) {
  return (
    <span className={`rmd-figure${props.tone ? ` rm-tone--${props.tone}` : ''}${props.end ? ' rmd-figure--end' : ''}`}>
      <span className="rm-k">{props.label}</span>
      <span className="rm-mb-figure-v num v-na">NA</span>
    </span>
  );
}
