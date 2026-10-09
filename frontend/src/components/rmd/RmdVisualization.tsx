'use client';

/**
 * RMD · Visualization — laid out like the HSM screen: KPI strip, mill mimic, then two rows of
 * paired panels. Only what the plant has confirmed is wired; everything else is NA, never a
 * sample figure:
 *   Production by shift   NA until the rolling plan arrives; running rate's logic is in place
 *                         (production ÷ running hours) and waits for production.
 *   Order allocation      NA — the ERP side is on hold (as the headline cards).
 *   Material balance      Billets (Influx BILLET_COUNT, M1 + M2) live; billet input in MT,
 *                         finished and yield NA; mass difference = input − finished (logic
 *                         in place, NA until both are there).
 *   Finished stock by size  not wired yet: NA.
 *
 * Names follow the HSM screen: production with / without an order is Made To Order / Made
 * To Stock; finished stock is Stock with order / Free stock.
 */
import Panel from '@/components/Panel';
import type { Series } from '@/components/visualization/KpiCard';
import ShiftBars from '@/components/visualization/ShiftBars';
import { fixed } from '@/lib/num';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmdBilletsReport, type RmdRunningRateReport } from '@/services/hsmApi';
import RmdKpiStrip from './RmdKpiStrip';
import RmdMillMimic from './RmdMillMimic';
import '@/components/visualization/visualization.css';
import './rmd.css';

/** Mass difference = billet input − finished, MT; null until both are known. */
export const massDifference = (inputMt: number | null, finishedMt: number | null) =>
  (inputMt === null || finishedMt === null ? null : inputMt - finishedMt);

const NA_SHIFT = { planMt: null, outputMt: null, compliancePct: null };

export default function RmdVisualization() {
  return (
    <div className="rm-viz">
      <RmdKpiStrip />
      <RmdMillMimic />
      <div className="rm-row">
        <ShiftBars
          shifts={[{ name: 'Day', ...NA_SHIFT }, { name: 'Night', ...NA_SHIFT }]}
          day={NA_SHIFT}
          planMt={null}
          planGapMt={null}
          sub="Day 08:00–20:00 IST · Night 20:00–08:00 IST"
          rate={<RunningRateFoot />}
        />
        <OrderAllocation />
      </div>
      <div className="rm-row">
        <MaterialBalance />
        <Panel title="Finished stock by size" className="rm-panel" bodyClass="rm-body">
          <p className="rm-empty">NA</p>
        </Panel>
      </div>
    </div>
  );
}

/* ----------------------------- Running rate ------------------------------ */

/** Production ÷ running hours over the Duration period — NA until production is wired. */
function RunningRateFoot() {
  const { dates } = useSelection();
  const url = rangeUrl('/api/rmd/running-rate', dates ? { ...dates, grain: 'day' } : null);
  const { data, dataUrl, error } = useApi<RmdRunningRateReport>(url);
  const current = data && dataUrl === url ? data : null;
  const rate = current?.totals.rateTph ?? null;
  return (
    <span className="rm-foot-item" title="Production ÷ running hours (billets no more than 10 min apart, either line)">
      <span className="rm-k">Running rate</span>
      {!current && !error
        ? <span className="skel skel--num" role="status" aria-label="Loading" />
        : <span className={`rm-foot-v num ${rate === null ? 'v-na' : 'v-val'}`}>{rate === null ? 'NA' : `${fixed(rate, 2)} TPH`}</span>}
    </span>
  );
}

/* ---------------------------- Order allocation --------------------------- */

function OrderAllocation() {
  return (
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
  );
}

/* ----------------------- Material & operating balance --------------------- */

/**
 * Drawn like the HSM panel: billet input split into finished | mass difference, to scale,
 * then the billet count. Only the count is wired (Influx); the bar stays empty until billet
 * input (MT) and finished production are.
 */
function MaterialBalance() {
  const { dates } = useSelection();
  const url = rangeUrl('/api/rmd/billets', dates ? { ...dates, grain: 'day' } : null);
  const { data, dataUrl, error } = useApi<RmdBilletsReport>(url);
  const billets = data && dataUrl === url ? data.totals.totalPcs : null;
  const loading = !(data && dataUrl === url) && !error;

  const inputMt: number | null = null;      // needs billet weight — no way to weigh billets yet
  const finishedMt: number | null = null;   // ERP on hold
  const diff = massDifference(inputMt, finishedMt);

  return (
    <Panel title="Material & operating balance" className="rm-panel" bodyClass="rm-body">
      <div className="rm-mb">
        <div className="rm-mb-head">
          <Figure label="Billet input" value="NA" />
          <Figure label="Yield" value="NA" tone="order" end />
        </div>
        <span className="rm-mb-bar rm-mb-bar--input" role="img" aria-label="Billet input: not available yet" />
        <div className="rm-mb-labels">
          <span className="rm-mb-caption rm-tone--order">Finished <b className="num v-na">NA</b></span>
          <span className="rm-mb-caption rm-tone--diff">Mass difference <b className="num v-na">{diff === null ? 'NA' : `${fixed(diff, 1)} MT`}</b></span>
        </div>

        <div className="rmd-mb-pieces">
          <span className="rm-k">Billets</span>
          {loading
            ? <span className="skel skel--num" role="status" aria-label="Loading" />
            : <span className="rm-mb-pieces-v num">{billets === null ? 'NA' : <><b>{billets.toLocaleString('en-IN')}</b>{' '}in</>}</span>}
        </div>
      </div>
    </Panel>
  );
}

/** A plain headline figure (no drill-down yet). */
function Figure(props: { label: string; value: string; tone?: Series; end?: boolean }) {
  return (
    <span className={`rmd-figure${props.tone ? ` rm-tone--${props.tone}` : ''}${props.end ? ' rmd-figure--end' : ''}`}>
      <span className="rm-k">{props.label}</span>
      <span className={`rm-mb-figure-v num ${props.value === 'NA' ? 'v-na' : ''}`}>{props.value}</span>
    </span>
  );
}
