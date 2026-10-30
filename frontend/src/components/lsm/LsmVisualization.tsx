'use client';

/**
 * LSM · Visualization — the same screen as HSM / RMD. Wired where the plant has confirmed the
 * source (lsm ERP DATA (1).xlsx, ERP Production Log Sheet FA-LP-P); NA everywhere else, never
 * a sample figure:
 *   Production            PRODUTION_MT (card, Order allocation, the balance's Finished);
 *   Mass yield            PRODUTION_MT ÷ INPUT_MT (billet input).
 *   Billets               INPUT_PCS (billets in, pieces).
 *   Finished stock        by section (Angle 65×8, Channel 75×40 …), the ERP's Stock Sheet Engine
 *                         for division LS; Order allocation's Finished stock is its total.
 *   Power, specific energy  the logbook's Daily Power Consumption Record (actual kWh, VCB-1)
 *                         ÷ PRODUTION_MT.
 *   Material balance      billet input, finished and the six losses (B_LOSS_MT, ENDCUT_MT,
 *                         MISROLL_MT, COLD_MT, REJECT_MT, SHORTLENGTH_MT), mass difference and yield.
 *   Production by shift   the plant's October 2026 plan (8,750 MT), spread to days, half per
 *                         shift, as RMD's; whole day = PRODUTION_MT vs plan.
 *   Running rate          PRODUTION_MT ÷ running hours calculated from the LSM Production Sheet's runs.
 *   Order allocation      the production and finished stock totals; no Made To Order / Stock split
 *                         and no Stock with order / Free stock (dropped on every mill — the user, 27 Oct 2026).
 * No mill mimic on LSM (the user, 16 Oct 2026).
 */
import { useState, type KeyboardEvent } from 'react';
import { ProductionTerm } from '@/components/production/productionTerm';
import { StockAsOf } from '@/components/production/stockAsOf';
import Panel from '@/components/Panel';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import RmdShiftProduction from '@/components/rmd/RmdShiftProduction';
import { FormRunningRateFoot } from '@/components/production/FormRunningRate';
import '@/components/visualization/visualization.css';
import { fixed } from '@/lib/num';
import { useSelection } from '@/services/hsmProduction';
import LsmProductionDrawer, { useLsmProduction } from './LsmProductionDrawer';
import RmdStockBySize, { useRmdStock } from '@/components/rmd/RmdStockBySize';
import PowerKpiCard from '@/components/production/PowerKpiCard';
import SpecificEnergyCard from '@/components/production/SpecificEnergyCard';
import '@/components/rmd/rmd.css';


const mt = (v: number | null | undefined) => (v === null || v === undefined ? 'NA' : `${fixed(v, 1)} MT`);

export default function LsmVisualization() {
  const { dates } = useSelection();
  const { data, error } = useLsmProduction(dates);
  const t = data?.totals ?? null;
  const [prodOpen, setProdOpen] = useState(false);
  const [yieldOpen, setYieldOpen] = useState(false);
  const note = error ? 'ERP data unavailable' : data?.erp.connection === 'down' ? data.erp.message : '';
  // Finished stock: the total of Finished stock by size (the ERP's Stock Sheet Engine, division LS).
  const stock = useRmdStock('lsm').data;
  const stockMt = stock && stock.erp.connection === 'up' ? stock.totalMt : null;

  return (
    <div className="rm-viz">
      <section className="rm-strip rm-strip--four" aria-label="Headline KPIs">
        <KpiCard
          label="Production"
          value={t?.productionMt == null ? 'NA' : fixed(t.productionMt, 1)}
          noEntries={!!data && data.erp.connection === 'up' && t?.productionMt == null}
          unit="MT"
          note={note}
          series="prod"
          loading={!data && !error}
          onOpen={() => setProdOpen(true)}
          openLabel="Production per day, from the ERP log sheet"
        />
        <KpiCard
          label="Mass yield"
          value={t?.massYieldPct == null ? 'NA' : fixed(t.massYieldPct, 1)}
          noEntries={!!data && data.erp.connection === 'up' && t?.massYieldPct == null}
          unit="%"
          note={note}
          series="order"
          loading={!data && !error}
          onOpen={() => setYieldOpen(true)}
          openLabel="Mass yield per day, from the ERP log sheet"
        />
        <PowerKpiCard mill="lsm" />
        <SpecificEnergyCard mill="lsm" />
      </section>
      <LsmProductionDrawer view="production" open={prodOpen} onClose={() => setProdOpen(false)} />
      <LsmProductionDrawer view="yield" open={yieldOpen} onClose={() => setYieldOpen(false)} />

      <div className="rm-row">
        <RmdShiftProduction
          mill="lsm"
          rate={<FormRunningRateFoot mill="lsm" />}
        />
        <Panel title="Order allocation" className="rm-panel" bodyClass="rm-body rm-alloc">
          <div className="rm-alloc-block">
            <div className="rm-alloc-head">
              <span className="rm-k">Production{data && t?.productionMt != null && <ProductionTerm from={data.from} to={data.to} lastDate={data.erp.lastDate} />}</span>
              <span className={`rm-alloc-total num ${t?.productionMt == null ? 'v-na' : 'v-val'}`}>{mt(t?.productionMt)}</span>
            </div>
          </div>
          <div className="rm-alloc-block">
            <div className="rm-alloc-head">
              <span className="rm-k">Finished stock{stockMt !== null && <StockAsOf asOf={stock?.asOf} lastDate={stock?.erp.lastDate} />}</span>
              <span className={`rm-alloc-total num ${stockMt === null ? 'v-na' : 'v-val'}`}>{mt(stockMt)}</span>
            </div>
          </div>
        </Panel>
      </div>

      <div className="rm-row">
        <MaterialBalance />
        <RmdStockBySize mill="lsm" />
      </div>
    </div>
  );
}

/** The losses the LSM log sheet books — the plant's five, plus short length. Together they are input − production. */
const LOSSES: { key: 'burningLossMt' | 'endCutMt' | 'missRollMt' | 'coldMt' | 'rejectMt' | 'shortLengthMt'; label: string; series: Series }[] = [
  { key: 'burningLossMt', label: 'Burning loss', series: 'bloss' },
  { key: 'endCutMt', label: 'End cut', series: 'endcut' },
  { key: 'missRollMt', label: 'Miss-roll', series: 'missroll' },
  { key: 'coldMt', label: 'Cold', series: 'hold' },
  { key: 'rejectMt', label: 'Reject', series: 'reject' },
  { key: 'shortLengthMt', label: 'Short length', series: 'inline' },
];

/** Drawn like RMD's: billet input split into finished | mass difference, then the losses opened out. One click: the drawer per day. */
function MaterialBalance() {
  const { dates } = useSelection();
  const t = useLsmProduction(dates).data?.totals ?? null;
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
        <span className="rm-mb-bar rm-mb-bar--input" role="img" aria-label={t?.billetInputMt == null ? 'Billet input: not available' : `Finished ${fixed(finishedPct, 1)}% of billet input`}>
          {t?.billetInputMt != null && <i className="rm-mb-seg rm-tone--order" style={{ width: `${finishedPct}%` }} />}
        </span>
        <div className="rm-mb-labels">
          <span className="rm-mb-caption rm-tone--order">Finished <b className={`num ${t?.productionMt == null ? 'v-na' : ''}`}>{mt(t?.productionMt)}</b></span>
          <span className="rm-mb-caption rm-tone--diff">Mass difference <b className={`num ${t?.massDiffMt == null ? 'v-na' : ''}`}>{mt(t?.massDiffMt)}</b></span>
        </div>
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
          {t?.billetsPcs == null
            ? <span className="rm-mb-pieces-v num v-na">NA</span>
            : <span className="rm-mb-pieces-v num"><b>{t.billetsPcs.toLocaleString('en-IN')}</b>{' '}in</span>}
        </div>
      </div>
      <LsmProductionDrawer view="balance" open={open} onClose={() => setOpen(false)} />
    </Panel>
  );
}

function Figure(props: { label: string; value: string; tone?: Series; end?: boolean }) {
  return (
    <span className={`rmd-figure${props.tone ? ` rm-tone--${props.tone}` : ''}${props.end ? ' rmd-figure--end' : ''}`}>
      <span className="rm-k">{props.label}</span>
      <span className={`rm-mb-figure-v num ${props.value === 'NA' ? 'v-na' : ''}`}>{props.value}</span>
    </span>
  );
}
