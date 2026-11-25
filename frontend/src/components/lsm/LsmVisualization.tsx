'use client';

/**
 * LSM · Visualization — the same screen as HSM / RMD. Wired where the plant has confirmed the
 * source (lsm ERP DATA (1).xlsx, ERP Production Log Sheet FA-LP-P); NA everywhere else, never
 * a sample figure:
 *   Production            PRODUTION_MT (card, Order allocation, the balance's Finished);
 *   Prime yield           PRODUTION_MT ÷ INPUT_MT (billet input) — was "Mass yield" (the user, 23 Nov 2026).
 *   Yield with non-prime  TOTAL_PRODUCTION (production + short length) ÷ INPUT_MT.
 *   Mill performance      availability, performance, efficiency, rolling in casting and in delivery — the
 *                         plant's management KPIs as the ERP log sheet holds them (Management Dash All.xlsx,
 *                         the user, 23 Nov 2026); LSM has no Online / Offline split in the ERP.
 *   Billets               INPUT_PCS (billets in, pieces).
 *   Finished stock        by section (Angle 65×8, Channel 75×40 …), the ERP's Stock Sheet Engine
 *                         for division LS; Order allocation's Finished stock is its total.
 *   Power, specific energy  the logbook's Daily Power Consumption Record (actual kWh, VCB-1)
 *                         ÷ PRODUTION_MT.
 *   Material balance      billet input, finished and the six losses (B_LOSS_MT, ENDCUT_MT,
 *                         MISROLL_MT, COLD_MT, REJECT_MT, SHORTLENGTH_MT), mass difference and yield.
 *   Production by shift   the logbook Production Plan form (LSM ROLLING PLAN, saved with Edit plan), per
 *                         shift, as RMD's; whole day = PRODUTION_MT vs plan.
 *   Running rate          PRODUTION_MT ÷ running hours calculated from the LSM Production Sheet's runs.
 *   Finished stock card   the total of Finished stock by size, dated; no Order allocation panel
 *                         (the user, 31 Oct 2026).
 * No mill mimic on LSM (the user, 16 Oct 2026).
 */
import { useState, type KeyboardEvent } from 'react';
import { lastFigure } from '@/services/lastEntry';
import { ofInput } from '@/components/production/ofInput';
import { productionTermText } from '@/components/production/productionTerm';
import FinishedStockCard from '@/components/production/FinishedStockCard';
import Panel from '@/components/Panel';
import BalanceStats from '@/components/production/BalanceStats';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import RmdShiftProduction from '@/components/rmd/RmdShiftProduction';
import { FormRunningRateFoot } from '@/components/production/FormRunningRate';
import '@/components/visualization/visualization.css';
import { fixed } from '@/lib/num';
import { useSelection } from '@/services/hsmProduction';
import LsmProductionDrawer, { BYPASS, useLsmProduction, type BypassKey } from './LsmProductionDrawer';
import RmdStockBySize from '@/components/rmd/RmdStockBySize';
import PowerKpiCard from '@/components/production/PowerKpiCard';
import SpecificEnergyCard from '@/components/production/SpecificEnergyCard';
import '@/components/rmd/rmd.css';


/** Breakdown hours = DELAY_HRS, Σ over the period (the user, 23 Nov 2026); the rest are percentages. */
const PERFORMANCE = [
  ['Availability', 'availabilityPct', '%'],
  ['Performance', 'performancePct', '%'],
  ['Efficiency', 'efficiencyPct', '%'],
  ['Rolling in casting', 'rollingInCastingPct', '%'],
  ['Rolling in delivery', 'rollingInDeliveryPct', '%'],
  ['Breakdown', 'delayHrs', 'h'],
] as const;

const mt = (v: number | null | undefined) => (v === null || v === undefined ? 'NA' : `${fixed(v, 1)} MT`);

export default function LsmVisualization() {
  const { dates } = useSelection();
  const { data, error, last } = useLsmProduction(dates);
  const t = data?.totals ?? null;
  const [prodOpen, setProdOpen] = useState(false);
  const [yieldOpen, setYieldOpen] = useState(false);
  /** The KPI whose own drill-down is open (the user, 25 Nov 2026: one drill-down each). */
  const [kpiOpen, setKpiOpen] = useState<(typeof PERFORMANCE)[number][1] | null>(null);
  const note = error ? 'ERP data unavailable' : data?.erp.connection === 'down' ? data.erp.message : '';

  return (
    <div className="rm-viz">
      <section className="rm-strip rm-strip--six" aria-label="Headline KPIs">
        <KpiCard
          label="Production"
          term={data ? productionTermText(data.from, data.to, data.erp.lastDate) : null}
          value={t?.productionMt == null ? 'NA' : fixed(t.productionMt, 1)}
          noEntries={!!data && data.erp.connection === 'up' && t?.productionMt == null}
          lastEntry={lastFigure(t?.productionMt, last, (d) => d.totals.productionMt, (n) => fixed(n, 1))}
          unit="MT"
          note={note}
          series="prod"
          loading={!data && !error}
          onOpen={() => setProdOpen(true)}
          openLabel="Production per day, from the ERP log sheet"
        />
        {([
          ['Prime yield', 'massYieldPct', 'Prime yield per day, from the ERP log sheet'],
          ['Yield with non-prime', 'nonPrimeYieldPct', 'Yield with non-prime per day, from the ERP log sheet'],
        ] as const).map(([label, k, openLabel]) => (
          <KpiCard
            key={k}
            label={label}
            value={t?.[k] == null ? 'NA' : fixed(t[k], 1)}
            noEntries={!!data && data.erp.connection === 'up' && t?.[k] == null}
            lastEntry={lastFigure(t?.[k], last, (d) => d.totals[k], (n) => fixed(n, 1))}
            unit="%"
            note={note}
            series="order"
            loading={!data && !error}
            onOpen={() => setYieldOpen(true)}
            openLabel={openLabel}
          />
        ))}
        <PowerKpiCard mill="lsm" />
        <SpecificEnergyCard mill="lsm" />
        {/* The total of Finished stock by size, dated; replaces the Order allocation panel (the user, 31 Oct 2026). */}
        <FinishedStockCard mill="lsm" />
        {/* Row 2: the plant's management KPIs (Management Dash All.xlsx, 23 Nov 2026) — two rows of six, as RMD's
            (the user, 23 Nov 2026); each opens its own drill-down (25 Nov). */}
        {PERFORMANCE.map(([label, k, unit]) => (
          <KpiCard
            key={k}
            label={label}
            value={t?.[k] == null ? 'NA' : fixed(t[k], 1)}
            noEntries={!!data && data.erp.connection === 'up' && t?.[k] == null}
            lastEntry={lastFigure(t?.[k], last, (d) => d.totals[k], (n) => fixed(n, 1))}
            unit={unit}
            note={note}
            series="ok"
            loading={!data && !error}
            // Each opens its own drill-down (the user, 25 Nov 2026).
            onOpen={() => setKpiOpen(k)}
            openLabel={`${label} per day, from the ERP log sheet`}
          />
        ))}
      </section>
      <LsmProductionDrawer view={kpiOpen === 'delayHrs' ? 'breakdown' : kpiOpen ?? 'availabilityPct'} open={kpiOpen !== null} onClose={() => setKpiOpen(null)} />
      <LsmProductionDrawer view="production" open={prodOpen} onClose={() => setProdOpen(false)} />
      <LsmProductionDrawer view="yield" open={yieldOpen} onClose={() => setYieldOpen(false)} />

      <div className="rm-row">
        <RmdShiftProduction
          mill="lsm"
          rate={<FormRunningRateFoot mill="lsm" />}
        />
        <RmdStockBySize mill="lsm" />
      </div>

      <div className="rm-row rm-row--full">
        <MaterialBalance />
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

/** The panel's operating figures, as HSM's (CCM bypass · HSM bypass); LSM's log sheet has no defective figure. */
const OPS: BypassKey[] = ['ccmBypassMt', 'lsmBypassMt'];

/**
 * Drawn like RMD's: billet input split into finished | mass difference, then the losses opened out. One click: the
 * drawer per day. Under it the two bypasses, each opening its own drill-down (the user, 25 Nov 2026).
 */
function MaterialBalance() {
  const { dates } = useSelection();
  const { data, error } = useLsmProduction(dates);
  const t = data?.totals ?? null;
  const [open, setOpen] = useState(false);
  const [op, setOp] = useState<BypassKey | null>(null);
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
          <Figure label="Prime yield" value={t?.massYieldPct == null ? 'NA' : `${fixed(t.massYieldPct, 1)}%`} tone="order" end />
        </div>
        <span className="rm-mb-bar rm-mb-bar--input" role="img" aria-label={t?.billetInputMt == null ? 'Billet input: not available' : `Finished ${fixed(finishedPct, 1)}% of billet input`}>
          {t?.billetInputMt != null && <i className="rm-mb-seg rm-tone--order" style={{ width: `${finishedPct}%` }} />}
        </span>
        <div className="rm-mb-labels">
          <span className="rm-mb-caption rm-tone--order">Finished <b className={`num ${t?.productionMt == null ? 'v-na' : ''}`}>{mt(t?.productionMt)}</b></span>
          <span className="rm-mb-caption rm-tone--diff">Mass difference <b className={`num ${t?.massDiffMt == null ? 'v-na' : ''}`}>{mt(t?.massDiffMt)}</b>
            {/* As HSM: each figure with its share of the billet input (the user, 30 Oct 2026). */}
            {ofInput(t?.massDiffMt, t?.billetInputMt) && <>{' '}<span className="rm-mb-dim num">· {ofInput(t?.massDiffMt, t?.billetInputMt)} of input</span></>}</span>
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
                <span>{l.label} <b className={`num ${l.value === null ? 'v-na' : ''}`}>{mt(l.value)}</b>{ofInput(l.value, t?.billetInputMt) && <>{' '}<span className="rm-mb-dim num">{ofInput(l.value, t?.billetInputMt)}</span></>}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <BalanceStats items={[
        { key: 'in', label: 'Billets in', value: t?.billetsPcs, unit: 'pcs', whole: true, loading: !data && !error, onOpen: () => setOpen(true), title: 'Material balance per day' },
        ...OPS.map((k) => ({ key: k, label: BYPASS[k].name, value: t?.[k], unit: 'MT', loading: !data && !error, onOpen: () => setOp(k), title: `${BYPASS[k].name} per day` })),
      ]} />
      <LsmProductionDrawer view="balance" open={open} onClose={() => setOpen(false)} />
      <LsmProductionDrawer view={op ?? 'ccmBypassMt'} open={op !== null} onClose={() => setOp(null)} />
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
