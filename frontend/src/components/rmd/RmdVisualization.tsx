/**
 * RMD · Visualization — the approved comp, laid out like the HSM screen: KPI strip, mill
 * mimic, then two rows of paired panels. Figures are ILLUSTRATIVE (rmdSample.ts) until the
 * RMD sources are wired; the screen says so in its head.
 *
 * Names follow the HSM screen: production with / without an order is Made To Order / Made
 * To Stock; finished stock is Stock with order / Free stock.
 */
import { Fragment } from 'react';
import Panel from '@/components/Panel';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import FlowArrow from '@/components/visualization/FlowArrow';
import StackBar from '@/components/visualization/StackBar';
import LegendItem from '@/components/visualization/Legend';
import ShiftBars from '@/components/visualization/ShiftBars';
import { fixed } from '@/lib/num';
import { RMD_SAMPLE, rmdView, type RmdView } from './rmdSample';
import '@/components/visualization/visualization.css';
import './rmd.css';

export default function RmdVisualization() {
  const v = rmdView(RMD_SAMPLE);
  return (
    <div className="rm-viz">
      <p className="rmd-banner" role="note">
        <span className="chip chip--na">Illustrative data</span>
        RMD figures are sample values from the design — the plant sources are not connected yet.
      </p>
      <KpiStrip v={v} />
      <MillMimic v={v} />
      <div className="rm-row">
        <ShiftBars
          shifts={v.shifts.map((s) => ({ ...s, compliancePct: s.planMt ? (s.outputMt / s.planMt) * 100 : null }))}
          day={{ planMt: v.planMt, outputMt: v.productionMt, compliancePct: v.planMt ? (v.productionMt / v.planMt) * 100 : null }}
          planMt={v.planMt}
          planGapMt={v.planGapMt}
          rate={
            <span className="rm-foot-item">
              <span className="rm-k">Running rate</span>
              <span className="rm-foot-v num v-val">{fixed(v.runningRateTph, 2)} TPH</span>
            </span>
          }
        />
        <OrderAllocation v={v} />
      </div>
      <div className="rm-row">
        <MaterialBalance v={v} />
        <StockBySize v={v} />
      </div>
    </div>
  );
}

/* ------------------------------- KPI strip ------------------------------- */

function KpiStrip({ v }: { v: RmdView }) {
  const cards: { label: string; value: string; unit: string; note: string; series: Series; meterPct?: number }[] = [
    { label: 'Production', value: fixed(v.productionMt, 1), unit: 'MT', note: `${fixed(v.planPct, 0)}% plan · ${fixed(v.runningRateTph, 2)} TPH`, series: 'prod', meterPct: v.planPct },
    { label: 'Mass yield', value: fixed(v.yieldPct, 1), unit: '%', note: `${fixed(v.productionMt, 1)} ÷ ${fixed(v.billetInputMt, 1)} MT`, series: 'order', meterPct: v.yieldPct },
    { label: 'Power consumption', value: fixed(v.energyMwh, 2), unit: 'MWh', note: 'Metered energy · day', series: 'prod' },
    { label: 'Specific energy', value: fixed(v.specificEnergyKwhPerMt, 1), unit: 'kWh/MT', note: 'Energy per finished MT', series: 'prod' },
    { label: 'Made To Stock', value: fixed(v.output.withoutOrderMt, 1), unit: 'MT', note: `${fixed(v.withoutOrderPct, 1)}% of day output`, series: 'free', meterPct: v.withoutOrderPct },
    { label: 'Stock with order', value: fixed(v.stockWithOrderMt, 0), unit: 'MT', note: `${fixed(v.stockWithOrderPct, 1)}% of finished stock`, series: 'order', meterPct: v.stockWithOrderPct },
    { label: 'Free stock', value: fixed(v.stockFreeMt, 0), unit: 'MT', note: `${fixed(v.stockFreePct, 1)}% of finished stock`, series: 'free', meterPct: v.stockFreePct },
  ];
  return (
    <section className="rm-strip" aria-label="Headline KPIs">
      {cards.map((c) => <KpiCard key={c.label} {...c} />)}
    </section>
  );
}

/* ------------------------------- Mill mimic ------------------------------ */

function MillMimic({ v }: { v: RmdView }) {
  const m = v.mimic;
  const zones = [
    { key: 'infeed', title: 'Billet infeed', value: `${m.infeedBillets} billets`, foot: 'Counter / entry', state: null },
    { key: 'roughing', title: 'Roughing group', value: m.roughing, foot: 'Group status', state: m.roughing },
    { key: 'route', title: 'Route / diverter', value: m.route, foot: 'Route state', state: m.route },
    { key: 'finishing', title: 'Finishing group', value: m.finishing, foot: 'Group status', state: m.finishing },
    { key: 'exit', title: 'Finished exit', value: `${fixed(v.productionMt, 1)} MT`, foot: 'ERP production', state: null },
  ];
  const tone = (s: string | null) => (s === null ? 'rm-zone--flow' : s === 'Running' || s === 'Active' ? 'rm-zone--ok' : s === 'Stopped' ? 'rm-zone--risk' : 'rm-zone--na');
  return (
    <Panel title="Mill mimic" sub="Grouped process zones · representative running state" right={<span className="chip chip--na">Stand map pending</span>}>
      <ol className="rm-mimic rmd-mimic" aria-label="Mill process flow">
        {zones.map((z, i) => (
          <Fragment key={z.key}>
            {i > 0 && <li className="rm-mimic-arrow" aria-hidden><FlowArrow /></li>}
            <li className="rm-mimic-cell">
              <div className={`rm-zone ${tone(z.state)}`}>
                <span className="rm-zone-title">{z.title}</span>
                <span className="rm-zone-body">
                  <span className={`rm-zone-value v-val${z.state ? ' rm-zone-state' : ' num'}`}>{z.value}</span>
                  {z.state && <PauseGlyph />}
                </span>
                <span className="rm-zone-foot">{z.foot}</span>
              </div>
            </li>
          </Fragment>
        ))}
      </ol>
    </Panel>
  );
}

/** Two bars: a stand group / route marker, as on the comp. */
function PauseGlyph() {
  return (
    <svg className="rm-zone-glyph" width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect x="3" y="2" width="3.5" height="12" rx="1.5" fill="currentColor" opacity="0.85" />
      <rect x="9.5" y="2" width="3.5" height="12" rx="1.5" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

/* ---------------------------- Order allocation --------------------------- */

function OrderAllocation({ v }: { v: RmdView }) {
  return (
    <Panel title="Order allocation" sub="Day production and period-end stock" right={<span className="chip chip--na">ERP</span>} className="rm-panel" bodyClass="rm-body rm-alloc">
      <div className="rm-alloc-block">
        <div className="rm-alloc-head">
          <span className="rm-k">Production</span>
          <span className="rm-alloc-total num v-val">{fixed(v.productionMt, 1)} MT</span>
        </div>
        <StackBar
          label={`Production ${fixed(v.productionMt, 1)} MT: made to order ${fixed(v.output.withOrderMt, 1)} MT, made to stock ${fixed(v.output.withoutOrderMt, 1)} MT`}
          parts={[
            { label: 'Made To Order', value: v.output.withOrderMt, series: 'order' },
            { label: 'Made To Stock', value: v.output.withoutOrderMt, series: 'free' },
          ]}
        />
        <div className="rm-legend">
          <LegendItem series="order" label="Made To Order" value={`${fixed(v.output.withOrderMt, 1)} MT`} />
          <LegendItem series="free" label="Made To Stock" value={`${fixed(v.output.withoutOrderMt, 1)} MT`} />
        </div>
      </div>
      <div className="rm-alloc-block">
        <div className="rm-alloc-head">
          <span className="rm-k">Finished stock</span>
          <span className="rm-alloc-total num v-val">{fixed(v.stockMt, 0)} MT</span>
        </div>
        <StackBar
          label={`Finished stock ${fixed(v.stockMt, 0)} MT: with order ${fixed(v.stockWithOrderMt, 0)} MT, free ${fixed(v.stockFreeMt, 0)} MT`}
          parts={[
            { label: 'With order', value: v.stockWithOrderMt, series: 'order' },
            { label: 'Free', value: v.stockFreeMt, series: 'free' },
          ]}
        />
        <div className="rm-legend">
          <LegendItem series="order" label="With order" value={`${fixed(v.stockWithOrderMt, 0)} MT`} />
          <LegendItem series="free" label="Free" value={`${fixed(v.stockFreeMt, 0)} MT`} />
          <span className="rm-legend-end"><b className="num">{fixed(v.orderCoverPct, 1)}%</b><span className="rm-k">order cover</span></span>
        </div>
      </div>
    </Panel>
  );
}

/* ----------------------- Material & operating balance --------------------- */

/**
 * Drawn like the HSM panel: the input split into finished | difference, to scale; then the
 * day split into run | non-run time. RMD books no loss breakdown on the comp, so the
 * difference is not opened out.
 */
function MaterialBalance({ v }: { v: RmdView }) {
  const finishedPct = (v.productionMt / v.billetInputMt) * 100;
  const hours = v.run.runH + v.run.nonRunH;
  return (
    <Panel title="Material & operating balance" className="rm-panel" bodyClass="rm-body">
      <div className="rm-mb">
        <div className="rm-mb-head">
          <Figure label="Billet input" value={`${fixed(v.billetInputMt, 1)} MT`} />
          <Figure label="Yield" value={`${fixed(v.yieldPct, 1)}%`} tone="order" end />
        </div>
        <span className="rm-mb-bar rm-mb-bar--input" role="img"
          aria-label={`Billet input ${fixed(v.billetInputMt, 1)} MT: finished ${fixed(v.productionMt, 1)} MT (${fixed(v.yieldPct, 1)}% yield), mass difference ${fixed(v.massDiffMt, 1)} MT`}>
          <i className="rm-mb-seg rm-tone--order" style={{ width: `${finishedPct}%` }} />
          <i className="rm-mb-seg rm-tone--diff" style={{ width: `${100 - finishedPct}%` }} />
        </span>
        <div className="rm-mb-labels">
          <span className="rm-mb-caption rm-tone--order">Finished <b className="num">{fixed(v.productionMt, 1)} MT</b></span>
          <span className="rm-mb-caption rm-tone--diff">
            Mass difference <b className="num">{fixed(v.massDiffMt, 1)} MT</b>{' '}
            <span className="rm-mb-dim num">· {fixed(v.massDiffPct, 1)}% of input</span>
          </span>
        </div>

        <div className="rm-mb-head rmd-mb-op">
          <Figure label="Run time" value={`${fixed(v.run.runH, 1)} h`} />
          <Figure label="Availability" value={`${fixed(v.availabilityPct, 1)}%`} tone="ok" end />
        </div>
        <span className="rm-mb-bar rm-mb-bar--loss" role="img"
          aria-label={`Day ${fixed(hours, 0)} h: run ${fixed(v.run.runH, 1)} h, non-run ${fixed(v.run.nonRunH, 1)} h, availability ${fixed(v.availabilityPct, 1)}%`}>
          <i className="rm-mb-seg rm-tone--prod" style={{ width: `${(v.run.runH / hours) * 100}%` }} />
          <i className="rm-mb-seg rm-tone--loss" style={{ width: `${(v.run.nonRunH / hours) * 100}%` }} />
        </span>
        <div className="rm-mb-labels">
          <span className="rm-mb-caption rm-tone--prod">Run <b className="num">{fixed(v.run.runH, 1)} h</b></span>
          <span className="rm-mb-caption rm-tone--loss">Non-run <b className="num">{fixed(v.run.nonRunH, 1)} h</b></span>
        </div>

        <div className="rmd-mb-pieces">
          <span className="rm-k">Billets</span>
          <span className="rm-mb-pieces-v num"><b>{v.billetsIn}</b> in · <b>{fixed(v.billetRatePerH, 2)}</b> per run hour</span>
        </div>
      </div>
    </Panel>
  );
}

function Figure(props: { label: string; value: string; tone?: Series; end?: boolean }) {
  return (
    <span className={`rmd-figure${props.tone ? ` rm-tone--${props.tone}` : ''}${props.end ? ' rmd-figure--end' : ''}`}>
      <span className="rm-k">{props.label}</span>
      <span className="rm-mb-figure-v num">{props.value}</span>
    </span>
  );
}

/* ------------------------- Finished stock by size ------------------------ */

function StockBySize({ v }: { v: RmdView }) {
  const max = Math.max(...v.stock.map((s) => s.withOrderMt + s.freeMt), 1);
  return (
    <Panel
      title="Finished stock by size"
      right={
        <span className="rm-legend rm-legend--head" aria-label="Series">
          <span className="rm-chip-series rm-tone--order">With order</span>
          <span className="rm-chip-series rm-tone--free">Free stock</span>
        </span>
      }
      className="rm-panel"
      bodyClass="rm-body"
    >
      <ul className="rm-sizes" aria-label={`${v.stock.length} sizes in stock`}>
        {v.stock.map((s) => {
          const total = s.withOrderMt + s.freeMt;
          return (
            <li key={s.size} className="rm-size rm-size--stock"
              aria-label={`${s.size}: with order ${fixed(s.withOrderMt, 0)} MT, free stock ${fixed(s.freeMt, 0)} MT`}>
              <span className="rm-size-name">{s.size}</span>
              <span className="rm-size-stack" aria-hidden>
                <i className="rm-tone--order" style={{ width: `${(s.withOrderMt / max) * 100}%` }} />
                <i className="rm-tone--free" style={{ width: `${(s.freeMt / max) * 100}%` }} />
              </span>
              <span className="rm-size-total num">{fixed(total, 0)} MT</span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
