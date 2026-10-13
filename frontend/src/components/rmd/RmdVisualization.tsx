'use client';

/**
 * RMD · Visualization — laid out like the HSM screen: KPI strip, mill mimic, then two rows of
 * paired panels. Only what the plant has confirmed is wired; everything else is NA, never a
 * sample figure:
 *   Production by shift   targets from the plant's month-wise FY plan (Prime + SL), half per
 *                         shift; output per shift NA (not in the ERP); whole day = ERP Prime + SL
 *                         vs plan. Running rate = ERP production ÷ running hours (billet counters).
 *   Order allocation      production total from the ERP log sheet; finished stock = the total of
 *                         Finished stock by size (ERP item ledger, FGYRDP, at the period end).
 *   Material balance      billet input, finished and the four losses from the ERP log sheet
 *                         (FA-SKJ); billets from Influx.
 *   Finished stock by size  ERP item ledger, FGYRDP, to the period end; a size opens its SKUs.
 *
 * Unlike HSM there is no Made To Order / Made To Stock split, and no Stock with order / Free
 * stock split: RMD's stock is all free stock, so stock is shown by size only (user, 12 Oct 2026).
 */
import Panel from '@/components/Panel';
import type { Series } from '@/components/visualization/KpiCard';
import { fixed } from '@/lib/num';
import { useState, type KeyboardEvent } from 'react';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmdBilletsReport, type RmdRunningRateReport } from '@/services/hsmApi';
import RmdKpiStrip from './RmdKpiStrip';
import RmdProductionDrawer, { useRmdProduction } from './RmdProductionDrawer';
import RmdMillMimic from './RmdMillMimic';
import RmdShiftProduction from './RmdShiftProduction';
import RmdRunningRateDrawer from './RmdRunningRateDrawer';
import RmdStockBySize, { useRmdStock } from './RmdStockBySize';
import '@/components/visualization/visualization.css';
import './rmd.css';

export default function RmdVisualization() {
  return (
    <div className="rm-viz">
      <RmdKpiStrip />
      <RmdMillMimic />
      <div className="rm-row">
        <RmdShiftProduction rate={<RunningRateFoot />} />
        <OrderAllocation />
      </div>
      <div className="rm-row">
        <MaterialBalance />
        <RmdStockBySize />
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
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="rm-foot-item rm-foot-btn" onClick={() => setOpen(true)} aria-haspopup="dialog" title="Running rate per day">
        <span className="rm-k">Running rate</span>
        {!current && !error
          ? <span className="skel skel--num" role="status" aria-label="Loading" />
          : <span className={`rm-foot-v num ${rate === null ? 'v-na' : 'v-val'}`}>{rate === null ? 'NA' : `${fixed(rate, 2)} TPH`}</span>}
      </button>
      <RmdRunningRateDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/* ---------------------------- Order allocation --------------------------- */

function OrderAllocation() {
  const { dates } = useSelection();
  const prod = useRmdProduction(dates).data?.totals.productionMt ?? null;
  // Finished stock: every SKU in FGYRDP at the end of the period — the total of Finished stock by size.
  const stock = useRmdStock().data;
  const stockMt = stock && stock.erp.connection === 'up' ? stock.totalMt : null;
  return (
    <Panel title="Order allocation" className="rm-panel" bodyClass="rm-body rm-alloc">
      <div className="rm-alloc-block">
        <div className="rm-alloc-head">
          <span className="rm-k">Production</span>
          <span className={`rm-alloc-total num ${prod === null ? 'v-na' : 'v-val'}`}>{prod === null ? 'NA' : `${fixed(prod, 1)} MT`}</span>
        </div>
      </div>
      <div className="rm-alloc-block">
        <div className="rm-alloc-head">
          <span className="rm-k">Finished stock</span>
          <span className={`rm-alloc-total num ${stockMt === null ? 'v-na' : 'v-val'}`}>{stockMt === null ? 'NA' : `${fixed(stockMt, 1)} MT`}</span>
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
 * then the losses opened out, then the billet count. Billet input (INPUT_MT), finished
 * (Prime + SL) and the losses come from the ERP log sheet; mass difference and yield are
 * computed in the backend. The whole balance is one click: the drawer shows it per day.
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

  // A loss that is 0 for the period isn't there: no segment, no legend entry. No data stays NA.
  const losses = LOSSES.map((l) => ({ ...l, value: t?.[l.key] ?? null })).filter((l) => l.value === null || l.value >= 0.05);
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
