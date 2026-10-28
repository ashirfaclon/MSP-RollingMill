'use client';

/**
 * LSM / RMS · Condition Analytics — the RMD screen's cards, wired only where the mill's sheet gives
 * a source (LSM.xlsx and R.M.S.xlsx, Condition Analytics; the user, 26 Oct 2026). NA everywhere else:
 *   Actual rate      "calculated": ERP production ÷ running hours from the Production Sheet form —
 *                    the Visualization running rate; opens its drill-down;
 *   Specific energy  LSM "app sheet" / RMS "calculated": the logbook Daily Power Consumption Record
 *                    ÷ ERP production — the Visualization card.
 * Output opportunity and conversion cost are "calculated" but need a target rate and cost figures;
 * the rest of the cost rows have no source. The full screen stays, NA where there is no source —
 * matched-run performance too — except the mill mimic: none on LSM or RMS (the user, 23 and 26 Oct 2026).
 */
import { useState } from 'react';
import CaInputs from '@/components/condition/CaInputs';
import '@/components/plan/plan.css';
import Panel from '@/components/Panel';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import SpecificEnergyCard from '@/components/production/SpecificEnergyCard';
import { FormRunningRateDrawer } from '@/components/production/FormRunningRate';
import { fixed } from '@/lib/num';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type FormRunningRateReport } from '@/services/hsmApi';
import '@/components/visualization/visualization.css';
import '@/components/asset/asset.css';

const NA = (label: string, unit: string, series: Series) => <KpiCard key={label} label={label} value="NA" unit={unit} note="" series={series} />;
const Row = ({ k }: { k: string }) => <div className="ah-row"><span className="rm-k">{k}</span><span className="num v-na">NA</span></div>;

export default function FormMillConditionAnalytics({ mill }: { mill: 'lsm' | 'rms' }) {
  const { dates } = useSelection();
  const url = rangeUrl(`/api/${mill}/running-rate`, dates ? { ...dates, grain: 'day' } : null);
  const rateS = useApi<FormRunningRateReport>(url);
  const rate = rateS.data && rateS.dataUrl === url ? rateS.data.totals.rateTph : null;
  const [open, setOpen] = useState(false);
  const [inputsOpen, setInputsOpen] = useState(false);

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
        {NA('Output opportunity', 'MT', 'order')}
        <SpecificEnergyCard mill={mill} />
        {NA('Conversion cost', '₹/MT', 'prod')}
        {NA('Cost variance', '₹/MT', 'hold')}
        {NA('Yield material loss', '₹', 'hold')}
        {NA('Output margin', '₹', 'order')}
      </section>

      <div className="rm-row">
        <Panel title="Matched-run performance" className="rm-panel" bodyClass="rm-body ah-list ah-list--top">
          {['Production rate · actual vs matched', 'Energy per MT · actual vs matched'].map((k) => <Row key={k} k={k} />)}
        </Panel>
        <Panel title="Costing & impact" className="rm-panel" bodyClass="rm-body ah-list ah-list--top" right={<button type="button" className="rm-plan-edit" aria-haspopup="dialog" onClick={() => setInputsOpen(true)} title="Targets and costs for the month">Edit inputs</button>}>
          {/* No repeats of the Conversion cost, Cost variance and Output margin cards (the user, 28 Oct 2026). */}
          {['Tariff', 'Contribution', 'Net material', 'Other conversion · actual / standard', 'Yield material variance'].map((k) => <Row key={k} k={k} />)}
        </Panel>
      </div>

      <FormRunningRateDrawer mill={mill} open={open} onClose={() => setOpen(false)} />
      <CaInputs mill={mill} open={inputsOpen} onClose={() => setInputsOpen(false)} />
    </div>
  );
}
