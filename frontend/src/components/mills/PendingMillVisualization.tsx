'use client';

/**
 * Visualization for a mill whose sources are not confirmed yet (RMS): the same screen as
 * HSM and RMD — KPI strip, then two rows of paired panels — every figure NA except
 * finished stock (by size, and Order allocation's total): the ERP's stock rule for division RS —
 * and production: the ERP log sheet (division RS, series L5P, PRODUCTION_MT), card and Order allocation;
 * billet input INPUT_MT1 + INPUT_MT2 of the same sheet, so mass yield (production ÷ input) and the
 * material balance's billet input, finished and mass difference, opened out into its five losses
 * (burning loss, end cut, miss-roll, cold, reject). Production by shift: the
 * plant's monthly plans (April–October 2026) against PRODUCTION_MT, as RMD's and LSM's; running
 * rate = PRODUCTION_MT ÷ running hours calculated from the RMS Production Sheet's runs.
 * Never a sample number. The KPI list follows the plant's Visualisation sheet for the mill
 * (LSM.xlsx / R.M.S.xlsx); each card and panel is wired once its source is confirmed.
 * Order allocation: the production and finished stock totals; no Made To Order / Stock split and no
 * Stock with order / Free stock (dropped on every mill — the user, 27 Oct 2026).
 * Power, specific energy: the RMS Daily Power Consumption Record (actual kWh, VCB-1) ÷ PRODUCTION_MT.
 * No mill mimic on RMS (the user, 16 Oct 2026), as on LSM.
 */
import { useState, type KeyboardEvent } from 'react';
import Panel from '@/components/Panel';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import RmdShiftProduction from '@/components/rmd/RmdShiftProduction';
import { FormRunningRateFoot } from '@/components/production/FormRunningRate';
import PowerKpiCard from '@/components/production/PowerKpiCard';
import SpecificEnergyCard from '@/components/production/SpecificEnergyCard';
import '@/components/visualization/visualization.css';
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
];

/** RMS losses (ERP log sheet): together they are billet input − production. */
const LOSSES: { key: 'burningLossMt' | 'endCutMt' | 'missRollMt' | 'coldMt' | 'rejectMt'; label: string; series: Series }[] = [
  { key: 'burningLossMt', label: 'Burning loss', series: 'bloss' },
  { key: 'endCutMt', label: 'End cut', series: 'endcut' },
  { key: 'missRollMt', label: 'Miss-roll', series: 'missroll' },
  { key: 'coldMt', label: 'Cold', series: 'hold' },
  { key: 'rejectMt', label: 'Reject', series: 'reject' },
];
const mt = (v: number | null | undefined) => (v === null || v === undefined ? 'NA' : `${fixed(v, 1)} MT`);

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
  const t = prod.data?.totals ?? null;
  const finishedPct = t?.productionMt != null && t.billetInputMt ? (t.productionMt / t.billetInputMt) * 100 : 0;
  // The losses that make up the mass difference; one at 0 for the period isn't there (no segment, no legend). No data stays NA.
  const losses = LOSSES.map((l) => ({ ...l, value: t?.[l.key] ?? null })).filter((l) => l.value === null || l.value >= 0.05);
  const lossSum = losses.reduce((a, l) => a + (l.value ?? 0), 0);
  const prodNote = prod.error ? 'ERP data unavailable' : prod.data?.erp.connection === 'down' ? prod.data.erp.message : '';
  const [prodOpen, setProdOpen] = useState(false);
  return (
    <div className="rm-viz">
      <section className="rm-strip rm-strip--four" aria-label="Headline KPIs">
        {CARDS.map((c) => c.label === 'Mass yield' && mill === 'rms'
          ? (
            <KpiCard
              key={c.label}
              label="Mass yield"
              value={t?.massYieldPct == null ? 'NA' : fixed(t.massYieldPct, 1)}
              noEntries={!!prod.data && prod.data.erp.connection === 'up' && t?.massYieldPct == null}
              unit="%"
              note={prodNote}
              series="order"
              loading={!prod.data && !prod.error}
              onOpen={() => setProdOpen(true)}
              openLabel="Mass yield per day, from the ERP log sheet"
            />
          )
          : c.label === 'Production' && mill === 'rms'
          ? (
            <KpiCard
              key={c.label}
              label="Production"
              value={prodMt === null ? 'NA' : fixed(prodMt, 1)}
              noEntries={!!prod.data && prod.data.erp.connection === 'up' && prodMt === null}
              unit="MT"
              note={prodNote}
              series="prod"
              loading={!prod.data && !prod.error}
              onOpen={() => setProdOpen(true)}
              openLabel="Production per day, from the ERP log sheet"
            />
          )
          // The RMS Daily Power Consumption Record; specific energy = that power ÷ PRODUCTION_MT.
          : c.label === 'Power consumption' && mill === 'rms'
          ? <PowerKpiCard key={c.label} mill="rms" />
          : c.label === 'Specific energy' && mill === 'rms'
          ? <SpecificEnergyCard key={c.label} mill="rms" />
          : <KpiCard key={c.label} label={c.label} value="NA" unit={c.unit} note="" series={c.series} />)}
      </section>
      {mill === 'rms' && <RmsProductionDrawer open={prodOpen} onClose={() => setProdOpen(false)} />}

      <div className="rm-row">
        <RmdShiftProduction
          mill={mill}
          rate={<FormRunningRateFoot mill={mill} />}
        />
        <Panel title="Order allocation" className="rm-panel" bodyClass="rm-body rm-alloc">
          <div className="rm-alloc-block">
            <div className="rm-alloc-head">
              <span className="rm-k">Production</span>
              <span className={`rm-alloc-total num ${prodMt === null ? 'v-na' : 'v-val'}`}>{prodMt === null ? 'NA' : `${fixed(prodMt, 1)} MT`}</span>
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
          <div
            className={`rm-mb${mill === 'rms' ? ' rm-mb--button' : ''}`}
            {...(mill === 'rms' ? {
              role: 'button', tabIndex: 0, 'aria-haspopup': 'dialog' as const, 'aria-label': 'Material balance, per day',
              title: 'Billet input, finished and mass difference, per day',
              onClick: () => setProdOpen(true),
              onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setProdOpen(true); } },
            } : {})}
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
            {mill === 'rms' && (
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
            )}
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

function Figure(props: { label: string; value: string; tone?: Series; end?: boolean }) {
  return (
    <span className={`rmd-figure${props.tone ? ` rm-tone--${props.tone}` : ''}${props.end ? ' rmd-figure--end' : ''}`}>
      <span className="rm-k">{props.label}</span>
      <span className={`rm-mb-figure-v num ${props.value === 'NA' ? 'v-na' : ''}`}>{props.value}</span>
    </span>
  );
}
