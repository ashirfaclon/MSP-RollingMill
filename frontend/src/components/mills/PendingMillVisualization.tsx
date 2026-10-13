'use client';

/**
 * Visualization for a mill whose sources are not confirmed yet (RMS): the same screen as
 * HSM and RMD — KPI strip, mill flow, then two rows of paired panels — every figure NA except
 * finished stock (by size, and Order allocation's total): the ERP's stock rule for division RS —
 * and production: the ERP log sheet (division RS, series L5P, PRODUCTION_MT), card and Order allocation.
 * Never a sample number. The KPI list follows the plant's Visualisation sheet for the mill
 * (LSM.xlsx / R.M.S.xlsx); each card and panel is wired once its source is confirmed.
 */
import { Fragment, useState } from 'react';
import Panel from '@/components/Panel';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import FlowArrow from '@/components/visualization/FlowArrow';
import ShiftBars from '@/components/visualization/ShiftBars';
import '@/components/visualization/visualization.css';
import { DAY_START_HOUR, shiftsLabel } from '@/lib/plantDay';
import '@/components/rmd/rmd.css';
import RmdStockBySize, { useRmdStock } from '@/components/rmd/RmdStockBySize';
import RmsProductionDrawer, { useRmsProduction } from '@/components/rms/RmsProductionDrawer';
import { useSelection } from '@/services/hsmProduction';
import { fixed } from '@/lib/num';

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
  // RMS finished stock: the total of Finished stock by size (the ERP's Stock Sheet Engine, division RS).
  const stock = useRmdStock(mill === 'rms' ? 'rms' : 'lsm').data;
  const stockMt = mill === 'rms' && stock && stock.erp.connection === 'up' ? stock.totalMt : null;
  // RMS production: the ERP log sheet (division RS, series L5P).
  const { dates } = useSelection();
  const prod = useRmsProduction(mill === 'rms' ? dates : null);
  const prodMt = prod.data?.totals.productionMt ?? null;
  // Billets in (pieces): INPUT_PCS of the same log sheet.
  const billetsPcs = prod.data?.totals.billetsPcs ?? null;
  const prodNote = prod.error ? 'ERP data unavailable' : prod.data?.erp.connection === 'down' ? prod.data.erp.message : '';
  const [prodOpen, setProdOpen] = useState(false);
  return (
    <div className="rm-viz">
      <section className="rm-strip" aria-label="Headline KPIs">
        {CARDS.map((c) => c.label === 'Production' && mill === 'rms'
          ? (
            <KpiCard
              key={c.label}
              label="Production"
              value={prodMt === null ? 'NA' : fixed(prodMt, 1)}
              unit="MT"
              note={prodNote}
              series="prod"
              loading={!prod.data && !prod.error}
              onOpen={() => setProdOpen(true)}
              openLabel="Production per day, from the ERP log sheet"
            />
          )
          : <KpiCard key={c.label} label={c.label} value="NA" unit={c.unit} note="" series={c.series} />)}
      </section>
      {mill === 'rms' && <RmsProductionDrawer open={prodOpen} onClose={() => setProdOpen(false)} />}

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
              <span className={`rm-alloc-total num ${prodMt === null ? 'v-na' : 'v-val'}`}>{prodMt === null ? 'NA' : `${fixed(prodMt, 1)} MT`}</span>
            </div>
            <div className="rm-legend">
              <span className="rmd-legend-item rm-tone--order"><i className="rm-dot" aria-hidden />Made To Order <b className="num v-na">NA</b></span>
              <span className="rmd-legend-item rm-tone--free"><i className="rm-dot" aria-hidden />Made To Stock <b className="num v-na">NA</b></span>
            </div>
          </div>
          <div className="rm-alloc-block">
            <div className="rm-alloc-head">
              <span className="rm-k">Finished stock</span>
              <span className={`rm-alloc-total num ${stockMt === null ? 'v-na' : 'v-val'}`}>{stockMt === null ? 'NA' : `${fixed(stockMt, 1)} MT`}</span>
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
              {billetsPcs === null
                ? <span className="rm-mb-pieces-v num v-na">NA</span>
                : <span className="rm-mb-pieces-v num"><b>{billetsPcs.toLocaleString('en-IN')}</b>{' '}in</span>}
            </div>
          </div>
        </Panel>
        {mill === 'rms' ? <RmdStockBySize mill="rms" /> : (
          <Panel title="Finished stock by size" className="rm-panel" bodyClass="rm-body">
            <p className="rm-empty">NA</p>
          </Panel>
        )}
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
