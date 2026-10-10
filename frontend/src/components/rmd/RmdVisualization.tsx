'use client';

/**
 * RMD · Visualization — laid out like the HSM screen: KPI strip, mill mimic, then two rows of
 * paired panels. Only what the plant has confirmed is wired; everything else is NA, never a
 * sample figure:
 *   Production by shift   NA until the rolling plan arrives; running rate = ERP production ÷
 *                         running hours (billet counters).
 *   Order allocation      production total from the ERP log sheet; MTO / MTS and stock NA.
 *   Material balance      finished and the four losses from the ERP log sheet (FA-SKJ);
 *                         billets from Influx; billet input in MT has no source yet, so mass
 *                         difference and yield (computed in the backend) stay NA until it does.
 *   Finished stock by size  not wired yet: NA.
 *
 * Names follow the HSM screen: production with / without an order is Made To Order / Made
 * To Stock; finished stock is Stock with order / Free stock.
 */
import Panel from '@/components/Panel';
import type { Series } from '@/components/visualization/KpiCard';
import ShiftBars from '@/components/visualization/ShiftBars';
import { fixed } from '@/lib/num';
import { useState, type KeyboardEvent } from 'react';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmdBilletsReport, type RmdRunningRateReport } from '@/services/hsmApi';
import RmdKpiStrip from './RmdKpiStrip';
import RmdProductionDrawer, { useRmdProduction } from './RmdProductionDrawer';
import RmdMillMimic from './RmdMillMimic';
import '@/components/visualization/visualization.css';
import './rmd.css';

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

/** ERP production ÷ running hours over the Duration period. */
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
  const { dates } = useSelection();
  const prod = useRmdProduction(dates).data?.totals.productionMt ?? null;
  return (
    <Panel title="Order allocation" className="rm-panel" bodyClass="rm-body rm-alloc">
      <div className="rm-alloc-block">
        <div className="rm-alloc-head">
          <span className="rm-k">Production</span>
          <span className={`rm-alloc-total num ${prod === null ? 'v-na' : 'v-val'}`}>{prod === null ? 'NA' : `${fixed(prod, 1)} MT`}</span>
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

/** The four losses the RMD log sheet books (codes as the plant gave them). */
const LOSSES: { key: 'burningLossMt' | 'endCutMt' | 'missRollMt' | 'chipOffMt'; label: string; series: Series }[] = [
  { key: 'burningLossMt', label: 'Burning loss', series: 'bloss' },
  { key: 'endCutMt', label: 'End cut', series: 'endcut' },
  { key: 'missRollMt', label: 'Miss-roll', series: 'missroll' },
  { key: 'chipOffMt', label: 'Chip off', series: 'reject' },
];
const mt = (v: number | null | undefined) => (v === null || v === undefined ? 'NA' : `${fixed(v, 1)} MT`);

/**
 * Drawn like the HSM panel: billet input split into finished | mass difference, to scale,
 * then the losses opened out, then the billet count. Finished and the losses come from the
 * ERP log sheet; billet input in MT has no source yet, so the input bar stays empty and mass
 * difference and yield read NA (computed in the backend the moment it exists). The whole
 * balance is one click: the drawer shows it per day.
 */
function MaterialBalance() {
  const { dates } = useSelection();
  const url = rangeUrl('/api/rmd/billets', dates ? { ...dates, grain: 'day' } : null);
  const { data, dataUrl, error } = useApi<RmdBilletsReport>(url);
  const billets = data && dataUrl === url ? data.totals.totalPcs : null;
  const loading = !(data && dataUrl === url) && !error;
  const t = useRmdProduction(dates).data?.totals ?? null;
  const [open, setOpen] = useState(false);
  const openOnKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } };

  const losses = LOSSES.map((l) => ({ ...l, value: t?.[l.key] ?? null }));
  const lossSum = losses.reduce((a, l) => a + (l.value ?? 0), 0);
  const finishedPct = t?.productionMt != null && t.billetInputMt ? (t.productionMt / t.billetInputMt) * 100 : 0;

  return (
    <Panel title="Material & operating balance" className="rm-panel" bodyClass="rm-body">
      <div
        className="rm-mb rm-mb--button"
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-label="Material balance, per day"
        title="Finished and losses, per day"
        onClick={() => setOpen(true)}
        onKeyDown={openOnKey}
      >
        <div className="rm-mb-head">
          <Figure label="Billet input" value={mt(t?.billetInputMt)} />
          <Figure label="Yield" value={t?.massYieldPct == null ? 'NA' : `${fixed(t.massYieldPct, 1)}%`} tone="order" end />
        </div>
        <span className="rm-mb-bar rm-mb-bar--input" role="img" aria-label={t?.billetInputMt == null ? 'Billet input: not available yet' : `Finished ${fixed(finishedPct, 1)}% of billet input`}>
          {t?.billetInputMt != null && <i className="rm-mb-seg rm-tone--order" style={{ width: `${finishedPct}%` }} />}
        </span>
        <div className="rm-mb-labels">
          <span className="rm-mb-caption rm-tone--order">Finished <b className={`num ${t?.productionMt == null ? 'v-na' : ''}`}>{mt(t?.productionMt)}</b></span>
          <span className="rm-mb-caption rm-tone--diff">Mass difference <b className={`num ${t?.massDiffMt == null ? 'v-na' : ''}`}>{mt(t?.massDiffMt)}</b></span>
        </div>

        {/* The losses the log sheet books, opened out to full width, to scale with each other. */}
        <div className="rm-mb-losses">
          <span className="rm-mb-bar rm-mb-bar--loss" role="img" aria-label={`Losses ${mt(t?.lossesMt)}: ${losses.map((l) => `${l.label.toLowerCase()} ${mt(l.value)}`).join(', ')}`}>
            {lossSum > 0 && losses.map((l) => (
              <i key={l.key} className={`rm-mb-seg rm-tone--${l.series}`} style={{ width: `${((l.value ?? 0) / lossSum) * 100}%` }} title={`${l.label} ${mt(l.value)}`} />
            ))}
          </span>
          <div className="rm-mb-legend">
            {losses.map((l) => (
              <span key={l.key} className={`rm-mb-link rm-tone--${l.series}`}>
                <i className="rm-dot" aria-hidden />
                <span>{l.label} <b className={`num ${l.value === null ? 'v-na' : ''}`}>{mt(l.value)}</b></span>
              </span>
            ))}
          </div>
        </div>

        <div className="rmd-mb-pieces">
          <span className="rm-k">Billets</span>
          {loading
            ? <span className="skel skel--num" role="status" aria-label="Loading" />
            : <span className="rm-mb-pieces-v num">{billets === null ? 'NA' : <><b>{billets.toLocaleString('en-IN')}</b>{' '}in</>}</span>}
        </div>
      </div>
      <RmdProductionDrawer view="balance" open={open} onClose={() => setOpen(false)} />
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
