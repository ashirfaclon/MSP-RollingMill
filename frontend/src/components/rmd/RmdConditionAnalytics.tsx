'use client';

/**
 * RMD · Condition Analytics — the layout of RMD_Condition_Analytics_Dashboard.png, sources as
 * RMD FACLON Persona - 2. Wired where a source exists; NA everywhere else, never a sample figure:
 *   Actual rate        ERP Prime + SL ÷ running hours from the billet counters — the
 *                      Visualization running rate (the user, 21 Oct 2026); opens its drill-down;
 *   Specific energy    the VCB 1 / 2 / 3 power forms ÷ ERP Prime + SL;
 *   Mimic              as the sheet (the plant, 21 Oct 2026), no roughing group (the user,
 *                      27 Oct 2026): billet infeed = billets ÷ running hours; route / diverter =
 *                      the CR Mill1/2 stands' running status now; finishing = the finishing drives'
 *                      current and speed while running; finished exit = actual rate. Finishing
 *                      opens each drive.
 *   Costing            the month's CA inputs (Edit inputs, logbook CA Inputs) with the figures above
 *                      (CaCosting): output opportunity, conversion cost, cost variance, yield material
 *                      loss, output margin, matched-run performance, costing & impact.
 *   Online / Offline   (top bar, the user, 13 Nov 2026) production, rate and specific energy of that
 *                      rolling from its ERP entries; costing NA (the CA inputs are for the whole mill).
 */
import { useState } from 'react';
import { useRmdProduction } from './RmdProductionDrawer';
import { lastFigure, useLastEntry } from '@/services/lastEntry';
import RmdMillMimic from './RmdMillMimic';
import CaInputs from '@/components/condition/CaInputs';
import { CaCard, CaCostRows, CaDrawer, CaMatchedRows, useCa } from '@/components/condition/CaCosting';
import '@/components/plan/plan.css';
import Panel from '@/components/Panel';
import KpiCard from '@/components/visualization/KpiCard';
import SpecificEnergyCard from '@/components/production/SpecificEnergyCard';
import { fixed } from '@/lib/num';
import { useSelection } from '@/services/hsmProduction';
import { useGlobalSel, type RmdModeSel } from '@/state/globalSel';
import { rangeUrl, useApi, type RmdRunningRateReport } from '@/services/hsmApi';
import RmdRunningRateDrawer from './RmdRunningRateDrawer';
import '@/components/visualization/visualization.css';
import './rmd.css';
import '@/components/asset/asset.css';

const CA_SOURCES: [string, string][] = [
  ['Production', 'ERP Production Log Sheet · PRODUCT_PRIME_SLENGTH_MT (Prime + SL), INPUT_MT, mass yield'],
  ['Running hours', 'Influx billet counters, M1 + M2 (billets ≤ 10 min apart)'],
  ['Power', 'Logbook TMT Electrical Department → Power Reading VCB 1 / 2 / 3'],
];
/** Online / Offline: that rolling's ERP entries only; the CA inputs are for the whole mill, so no costing (the user, 13 Nov 2026). */
const caSourcesOf = (mode: RmdModeSel): [string, string][] => (mode === 'all' ? CA_SOURCES : [
  ['Rolling', `${mode === 'online' ? 'Online · TRAN_COLUMN_NAME1 = RO001' : 'Offline · TRAN_COLUMN_NAME1 = RO002'}`],
  ['Production', 'ERP Production Log Sheet · PRODUCT_PRIME_SLENGTH_MT (Prime + SL), INPUT_MT, mass yield'],
  ['Running hours', 'ERP Production Log Sheet · ACTUAL_RUNNING_HRS'],
  ['Power', 'ERP Production Log Sheet · TOTAL_POWER_CONSUMPTION'],
  ['Costing', 'The CA inputs are for the whole mill: shown under Both only'],
]);

export default function RmdConditionAnalytics() {
  const { dates } = useSelection();
  const { rmdMode } = useGlobalSel();
  const rateUrl = rangeUrl('/api/rmd/running-rate', dates ? { ...dates, grain: 'day' } : null);
  const rateS = useApi<RmdRunningRateReport>(rateUrl);
  const rate = rateS.data && rateS.dataUrl === rateUrl ? rateS.data.totals : null;
  /* No rate in the period (production not booked yet): the last day the ERP has (the user, 30 Oct 2026). */
  const erpLast = useRmdProduction(dates).data?.erp.lastDate;
  const rateLast = useLastEntry<RmdRunningRateReport>('/api/rmd/running-rate', !!rate && rate.rateTph == null, erpLast, dates?.from, 'grain=day');
  const [open, setOpen] = useState<'rate' | 'ca' | null>(null);
  const ca = useCa('rmd');
  const openCa = () => setOpen('ca');
  const [inputsOpen, setInputsOpen] = useState(false);


  return (
    <div className="rm-viz">
      <section className="rm-strip" aria-label="Condition KPIs">
        <KpiCard
          label="Actual rate"
          value={rate?.rateTph == null ? 'NA' : fixed(rate.rateTph, 2)}
          noEntries={!!rate && rate.rateTph == null}
          lastEntry={lastFigure(rate?.rateTph, rateLast, (d) => d.totals.rateTph, (n) => fixed(n, 2))}
          unit="TPH"
          note=""
          series="prod"
          loading={!rateS.data && !rateS.error}
          onOpen={() => setOpen('rate')}
          openLabel="Running rate per day"
        />
        <CaCard id="opportunity" ca={ca} onOpen={openCa} />
        <SpecificEnergyCard mill="rmd" />
        <CaCard id="conversion" ca={ca} onOpen={openCa} />
        <CaCard id="variance" ca={ca} onOpen={openCa} />
        <CaCard id="yieldLoss" ca={ca} onOpen={openCa} />
        <CaCard id="margin" ca={ca} onOpen={openCa} />
      </section>

      <div className="rm-row">
        <Panel title="Matched-run performance" className="rm-panel" bodyClass="rm-body ah-list ah-list--top">
          <CaMatchedRows ca={ca} />
        </Panel>
        <Panel title="Costing & impact" className="rm-panel" bodyClass="rm-body ah-list ah-list--top" right={<button type="button" className="rm-plan-edit" aria-haspopup="dialog" onClick={() => setInputsOpen(true)} title="Targets and costs for the month">Edit inputs</button>}>
          {/* No repeats of the Conversion cost, Cost variance and Output margin cards (the user, 28 Oct 2026). */}
          <CaCostRows ca={ca} />
        </Panel>
      </div>

      <RmdRunningRateDrawer open={open === 'rate'} onClose={() => setOpen(null)} />
      <CaDrawer open={open === 'ca'} onClose={() => setOpen(null)} mill="rmd" ca={ca} sources={caSourcesOf(rmdMode)} />
      <CaInputs mill={'rmd'} open={inputsOpen} onClose={() => setInputsOpen(false)} />
      {/* The mill mimic — the same twin as Visualization — at the bottom of the page (the user, 30 Oct 2026). */}
      <RmdMillMimic />
    </div>
  );
}
