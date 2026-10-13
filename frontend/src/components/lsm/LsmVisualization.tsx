'use client';

/**
 * LSM · Visualization — the same screen as HSM / RMD. Wired where the plant has confirmed the
 * source (lsm ERP DATA (1).xlsx, ERP Production Log Sheet FA-LP-P); NA everywhere else, never
 * a sample figure:
 *   Production            PRODUTION_MT (card, Order allocation, the balance's Finished);
 *   Material balance      finished and the five losses (B_LOSS_MT, ENDCUT_MT, MISROLL_MT,
 *                         COLD_MT, REJECT_MT); billet input in MT not given, so input, mass
 *                         difference and yield are NA.
 */
import { Fragment, useState, type KeyboardEvent } from 'react';
import Panel from '@/components/Panel';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import FlowArrow from '@/components/visualization/FlowArrow';
import ShiftBars from '@/components/visualization/ShiftBars';
import '@/components/visualization/visualization.css';
import { DAY_START_HOUR, shiftsLabel } from '@/lib/plantDay';
import { fixed } from '@/lib/num';
import { useSelection } from '@/services/hsmProduction';
import LsmProductionDrawer, { useLsmProduction } from './LsmProductionDrawer';
import '@/components/rmd/rmd.css';

const NA_CARDS: { label: string; unit: string; series: Series }[] = [
  { label: 'Mass yield', unit: '%', series: 'order' },
  { label: 'Power consumption', unit: 'MWh', series: 'prod' },
  { label: 'Specific energy', unit: 'kWh/MT', series: 'prod' },
  { label: 'Made To Stock', unit: 'MT', series: 'free' },
  { label: 'Stock with order', unit: 'MT', series: 'order' },
  { label: 'Free stock', unit: 'MT', series: 'free' },
];

const ZONES = ['Billet delivery rate', 'Roughing group', 'Intermediate group', 'Finishing group', 'Finish exit'];
const NA_SHIFT = { planMt: null, outputMt: null, compliancePct: null };
const mt = (v: number | null | undefined) => (v === null || v === undefined ? 'NA' : `${fixed(v, 1)} MT`);

export default function LsmVisualization() {
  const { dates } = useSelection();
  const { data, error } = useLsmProduction(dates);
  const t = data?.totals ?? null;
  const [prodOpen, setProdOpen] = useState(false);
  const note = error ? 'ERP data unavailable' : data?.erp.connection === 'down' ? data.erp.message : '';

  return (
    <div className="rm-viz">
      <section className="rm-strip" aria-label="Headline KPIs">
        <KpiCard
          label="Production"
          value={t?.productionMt == null ? 'NA' : fixed(t.productionMt, 1)}
          unit="MT"
          note={note}
          series="prod"
          loading={!data && !error}
          onOpen={() => setProdOpen(true)}
          openLabel="Production per day, from the ERP log sheet"
        />
        {NA_CARDS.map((c) => <KpiCard key={c.label} label={c.label} value="NA" unit={c.unit} note="" series={c.series} />)}
      </section>
      <LsmProductionDrawer view="production" open={prodOpen} onClose={() => setProdOpen(false)} />

      <Panel title="Mill mimic">
        <ol className="rm-mimic rmd-mimic" aria-label="Mill process flow">
          {ZONES.map((z, i) => (
            <Fragment key={z}>
              {i > 0 && <li className="rm-mimic-arrow" aria-hidden><FlowArrow /></li>}
              <li className="rm-mimic-cell">
                <div className="rm-zone rm-zone--flow">
                  <span className="rm-zone-title">{z}</span>
                  <span className="rm-zone-body"><span className="rm-zone-value num v-na">NA</span></span>
                  <span className="rm-zone-foot">{' '}</span>
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
          sub={shiftsLabel(DAY_START_HOUR.lsm)}
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
              <span className={`rm-alloc-total num ${t?.productionMt == null ? 'v-na' : 'v-val'}`}>{mt(t?.productionMt)}</span>
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
        <MaterialBalance />
        <Panel title="Finished stock by size" className="rm-panel" bodyClass="rm-body">
          <p className="rm-empty">NA</p>
        </Panel>
      </div>
    </div>
  );
}

/** The five losses the LSM log sheet books (codes as the plant gave them). */
const LOSSES: { key: 'burningLossMt' | 'endCutMt' | 'missRollMt' | 'coldMt' | 'rejectMt'; label: string; series: Series }[] = [
  { key: 'burningLossMt', label: 'Burning loss', series: 'bloss' },
  { key: 'endCutMt', label: 'End cut', series: 'endcut' },
  { key: 'missRollMt', label: 'Miss-roll', series: 'missroll' },
  { key: 'coldMt', label: 'Cold', series: 'hold' },
  { key: 'rejectMt', label: 'Reject', series: 'reject' },
];

/** Drawn like RMD's: billet input (NA — not given), finished, then the losses opened out. One click: the drawer per day. */
function MaterialBalance() {
  const { dates } = useSelection();
  const t = useLsmProduction(dates).data?.totals ?? null;
  const [open, setOpen] = useState(false);
  const openOnKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } };
  // A loss that is 0 for the period isn't there: no segment, no legend entry. No data stays NA.
  const losses = LOSSES.map((l) => ({ ...l, value: t?.[l.key] ?? null })).filter((l) => l.value === null || l.value >= 0.05);
  const lossSum = losses.reduce((a, l) => a + (l.value ?? 0), 0);

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
          <Figure label="Billet input" value="NA" />
          <Figure label="Yield" value="NA" tone="order" end />
        </div>
        <span className="rm-mb-bar rm-mb-bar--input" role="img" aria-label="Billet input: not available" />
        <div className="rm-mb-labels">
          <span className="rm-mb-caption rm-tone--order">Finished <b className={`num ${t?.productionMt == null ? 'v-na' : ''}`}>{mt(t?.productionMt)}</b></span>
          <span className="rm-mb-caption rm-tone--diff">Mass difference <b className="num v-na">NA</b></span>
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
          <span className="rm-mb-pieces-v num v-na">NA</span>
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
