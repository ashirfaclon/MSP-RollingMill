'use client';

/**
 * LSM / RMS · Condition Analytics — the RMD screen's cards, wired only where the mill's sheet gives
 * a source (LSM.xlsx and R.M.S.xlsx, Condition Analytics; the user, 26 Oct 2026). NA everywhere else:
 *   Actual rate      "calculated": ERP production ÷ running hours from the Production Sheet form —
 *                    the Visualization running rate; opens its drill-down;
 *   Specific energy  LSM "app sheet" / RMS "calculated": the logbook Daily Power Consumption Record
 *                    ÷ ERP production — the Visualization card.
 *   Costing          the month's CA inputs (Edit inputs, logbook CA Inputs) with the figures above
 *                    (CaCosting): output opportunity, conversion cost, cost variance, yield material
 *                    loss, output margin, matched-run performance, costing & impact.
 * No mill mimic on LSM or RMS (the user, 23 and 26 Oct 2026).
 */
import { useState } from 'react';
import CaInputs from '@/components/condition/CaInputs';
import { CaCard, CaCostRows, CaDrawer, CaMatchedRows, useCa } from '@/components/condition/CaCosting';
import '@/components/plan/plan.css';
import Panel from '@/components/Panel';
import KpiCard from '@/components/visualization/KpiCard';
import SpecificEnergyCard from '@/components/production/SpecificEnergyCard';
import { FormRunningRateDrawer } from '@/components/production/FormRunningRate';
import { fixed } from '@/lib/num';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type FormRunningRateReport } from '@/services/hsmApi';
import '@/components/visualization/visualization.css';
import '@/components/asset/asset.css';

const caSources = (mill: 'lsm' | 'rms'): [string, string][] => [
  ['Production', `ERP Production Log Sheet · ${mill === 'lsm' ? 'PRODUTION_MT' : 'PRODUCTION_MT'}, INPUT_MT, mass yield`],
  ['Running hours', `Logbook ${mill.toUpperCase()} Production Sheet (each run, start → end)`],
  ['Power', `Logbook ${mill === 'lsm' ? 'Electrical Logbook' : 'RMS Electrical Logbook'} → Daily Power Consumption Record`],
];

export default function FormMillConditionAnalytics({ mill }: { mill: 'lsm' | 'rms' }) {
  const { dates } = useSelection();
  const url = rangeUrl(`/api/${mill}/running-rate`, dates ? { ...dates, grain: 'day' } : null);
  const rateS = useApi<FormRunningRateReport>(url);
  const rate = rateS.data && rateS.dataUrl === url ? rateS.data.totals.rateTph : null;
  const [open, setOpen] = useState(false);
  const [inputsOpen, setInputsOpen] = useState(false);
  const [caOpen, setCaOpen] = useState(false);
  const ca = useCa(mill);
  const openCa = () => setCaOpen(true);

  return (
    <div className="rm-viz">
      <section className="rm-strip" aria-label="Condition KPIs">
        <KpiCard
          label="Actual rate"
          value={rate === null ? 'NA' : fixed(rate, 2)}
          noEntries={!!rateS.data && rateS.dataUrl === url && rate === null}
          unit="TPH"
          note=""
          series="prod"
          loading={!rateS.data && !rateS.error}
          onOpen={() => setOpen(true)}
          openLabel="Running rate per day"
        />
        <CaCard id="opportunity" ca={ca} onOpen={openCa} />
        <SpecificEnergyCard mill={mill} />
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

      <FormRunningRateDrawer mill={mill} open={open} onClose={() => setOpen(false)} />
      <CaDrawer open={caOpen} onClose={() => setCaOpen(false)} mill={mill} ca={ca} sources={caSources(mill)} />
      <CaInputs mill={mill} open={inputsOpen} onClose={() => setInputsOpen(false)} />
    </div>
  );
}
