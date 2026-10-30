'use client';

/**
 * HSM · Condition Analytics — the layout of HSM_Condition_Analytics_Dashboard.png, sources exactly
 * as the HSM sheet (HSM source KPI.xlsx, Condition Analytics). Wired only where the sheet's own
 * source exists; NA everywhere else, never a sample figure:
 *   Actual running rate  ERP FG posted MT (log sheet PRODUCTION_MT) ÷ running hours from the
 *                        historian (Dicharged_Billet: billets ≤ 10 min apart — the Visualization
 *                        running hours), over the days that have both; opens per day;
 *   Finished exit        "Row 10" — the actual running rate;
 *   Billet infeed, Roughing / Finishing group   the Visualization mimic's Influx tags (the user,
 *                        26 Oct 2026): billets since 08:00, RM / FM drives on (On_Off);
 *   Specific energy      the logbook Electrical HSM → Power Consumption ÷ ERP production, over the
 *                        days with both (the plant has no EMS meter; the user, 26 Oct 2026);
 *   Conversion cost,     the plant's monthly costing sheet (2026 Costing - SEP26.xlsx, 27 Oct 2026):
 *   Yield material loss, conversion cost ₹/MT, the losses' ₹ (MT × ₹/MT), tariff, other conversion
 *   costing rows         and net material rates — for a period whose months all have a sheet;
 *   Product header       ERP size (PROD_TRAN receipts, the most produced strip size, and how
 *                        many others) and the running hours; grade and route are not in the ERP data.
 *   CA costing           the month's CA inputs (Edit inputs, logbook CA Inputs — the config replaces
 *                        the costing sheet) with the figures above (CaCosting): output opportunity,
 *                        conversion cost, cost variance, yield material loss, output margin, matched-run
 *                        and costing rows. A period with no inputs keeps the costing sheet where it has one.
 * Waiting on the plant / ERP: approved limits, the stand map and route layout, the machine inspection form.
 */
import { Fragment, useMemo, useState } from 'react';
import { lastFigure, useLastEntry } from '@/services/lastEntry';
import CaInputs from './CaInputs';
import { CaCard, CaCostRows, CaDrawer, CaMatchedRows, inr, useCa } from './CaCosting';
import '@/components/plan/plan.css';
import Panel from '@/components/Panel';
import KpiCard from '@/components/visualization/KpiCard';
import HsmSpecificEnergy from './HsmSpecificEnergy';
import HsmCostingDrawer from './HsmCostingDrawer';
import MillMimic from '@/components/visualization/MillMimic';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import SourceBox from '@/components/drill/SourceBox';
import { fixed } from '@/lib/num';
import { dm, useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type CostingReport, type RateDay, type RunningRateReport, type SizeReport } from '@/services/hsmApi';
import '@/components/visualization/visualization.css';
import '@/components/rmd/rmd.css';
import '@/components/asset/asset.css';
import './condition.css';

const CA_SOURCES: [string, string][] = [
  ['Production', 'ERP log sheet L6P · PRODUCTION_MT; billet input and mass yield (the Mass yield card)'],
  ['Running hours', 'Influx Dicharged_Billet (billets ≤ 10 min apart), over the days with ERP production'],
  ['Power', 'Logbook Electrical HSM → Power Consumption, ÷ ERP production over the days with both'],
];
const Row = ({ k, v = null }: { k: string; v?: string | null }) => (
  <div className="ah-row"><span className="rm-k">{k}</span><span className={`num ${v === null ? 'v-na' : 'v-val'}`}>{v ?? 'NA'}</span></div>
);

/** ERP MT ÷ historian running hours over the days that have both (ERP entries come a day late). */
export function actualRate(days: RateDay[]) {
  const both = days.filter((d) => d.erpMt !== null && d.runH !== null && d.runH > 0);
  const mt = both.reduce((a, d) => a + d.erpMt!, 0);
  const h = both.reduce((a, d) => a + d.runH!, 0);
  return { mt, h, days: both.length, tph: h > 0 ? mt / h : null };
}

export default function HsmConditionAnalytics() {
  const { dates } = useSelection();
  const rateUrl = rangeUrl('/api/hsm/running-rate', dates ? { ...dates, grain: 'day' } : null);
  const sizesUrl = rangeUrl('/api/hsm/sizes', dates);
  const rateS = useApi<RunningRateReport>(rateUrl);
  const sizesS = useApi<SizeReport>(sizesUrl);
  const rateR = rateS.data && rateS.dataUrl === rateUrl ? rateS.data : null;
  const sizes = sizesS.data && sizesS.dataUrl === sizesUrl ? sizesS.data.rows.filter((r) => !r.defective && r.producedMt > 0) : null;
  const [open, setOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  const [inputsOpen, setInputsOpen] = useState(false);
  const [caOpen, setCaOpen] = useState(false);
  const ca = useCa('hsm');
  const openCa = () => setCaOpen(true);
  const openSheet = () => setCostOpen(true);
  const costUrl = rangeUrl('/api/hsm/costing', dates);
  const costS = useApi<CostingReport>(costUrl);
  const cost = costS.data && costS.dataUrl === costUrl ? costS.data : null;
  const cp = cost?.period ?? null;
  // Net material rates as the sheet prices the losses (burning loss apart from the scrap-type losses).
  const rates = cost?.sheets.length === 1 ? cost.sheets[0].losses : null;
  const burning = rates?.find((l) => l.name === 'Burning loss')?.rate ?? null;
  const scrap = rates?.find((l) => l.name !== 'Burning loss')?.rate ?? null;

  const rate = useMemo(() => (rateR ? actualRate(rateR.days) : null), [rateR]);
  /* No day with both ERP production and running hours in the period: the last day the ERP has (the user, 30 Oct 2026). */
  const rateLast = useLastEntry<RunningRateReport>('/api/hsm/running-rate', !!rateR && rate?.tph == null, rateR?.erp.lastDate, dates?.from, 'grain=day');
  const tph = rate?.tph ?? null;
  const top = sizes?.length ? [...sizes].sort((a, b) => b.producedMt - a.producedMt)[0] : null;
  const runH = rateR?.totals.runH ?? null;

  return (
    <div className="rm-viz ah">
      <Panel className="ah-asset hca-head" bodyClass="ah-asset-body">
        <div className="ah-asset-id">
          <span className="rm-k">Product · size</span>
          <h2 className="ah-asset-name">
            {top ? <>{top.label} mm{sizes!.length > 1 && <span className="hca-more"> +{sizes!.length - 1} more</span>}</> : <span className="v-na">NA</span>}
          </h2>
        </div>
        <span />
        <dl className="ah-asset-facts">
          <div className="ah-fact"><dt className="rm-k">Grade</dt><dd className="num v-na">NA</dd></div>
          <div className="ah-fact"><dt className="rm-k">Route</dt><dd className="num v-na">NA</dd></div>
          <div className="ah-fact"><dt className="rm-k">Running hours</dt><dd className={`num ${runH === null ? 'v-na' : 'v-val'}`}>{runH === null ? 'NA' : `${fixed(runH, 1)} h`}</dd></div>
        </dl>
      </Panel>

      <section className="rm-strip" aria-label="Condition KPIs">
        <KpiCard
          label="Actual rate"
          value={tph === null ? 'NA' : fixed(tph, 2)}
          noEntries={!!rateR && tph === null}
          lastEntry={lastFigure(tph, rateLast, (d) => actualRate(d.days).tph, (n) => fixed(n, 2))}
          unit="TPH"
          note=""
          series="prod"
          loading={!rateS.data && !rateS.error}
          onOpen={() => setOpen(true)}
          openLabel="Actual running rate per day"
        />
        <CaCard id="opportunity" ca={ca} onOpen={openCa} />
        <HsmSpecificEnergy />
        <CaCard id="conversion" ca={ca} onOpen={openCa} fallback={{ value: cp?.conversionPerMt ?? null, onOpen: openSheet }} />
        <CaCard id="variance" ca={ca} onOpen={openCa} />
        <CaCard id="yieldLoss" ca={ca} onOpen={openCa} unitYield="₹ lakh" fallback={{ value: cp?.materialLossRs ?? null, onOpen: openSheet }} />
        <CaCard id="margin" ca={ca} onOpen={openCa} />
      </section>

      <div className="rm-row">
        <Panel title="Matched-run performance" className="rm-panel" bodyClass="rm-body ah-list ah-list--top">
          <CaMatchedRows ca={ca} />
        </Panel>
        <Panel title="Costing & impact" className="rm-panel" bodyClass="rm-body ah-list ah-list--top" right={<button type="button" className="rm-plan-edit" aria-haspopup="dialog" onClick={() => setInputsOpen(true)} title="Targets and costs for the month">Edit inputs</button>}>
          {/* No repeats of the Conversion cost, Cost variance and Output margin cards (the user, 28 Oct 2026). */}
          <CaCostRows ca={ca} sheet={{
            tariff: cp ? `${inr(cp.tariffPerKwh, 2)}/kWh` : null,
            net: burning !== null && scrap !== null ? `${inr(burning)}/MT burning loss · ${inr(scrap)}/MT other losses` : null,
            other: cp ? `${inr(cp.otherConversionPerMt)}/MT · standard NA` : null,
          }} />
        </Panel>
      </div>

      <HsmCostingDrawer open={costOpen} onClose={() => setCostOpen(false)} report={cost} loading={!costS.data && !costS.error} error={costS.error} />
      <DrillDrawer open={open} onClose={() => setOpen(false)} title="Actual running rate" sub="HSM · TPH"
        loading={!rateS.data && !rateS.error} error={rateS.error} hasData={!!rateR}>
        {rateR && rate && <RateContent days={rateR.days} rate={rate} />}
      </DrillDrawer>
      <CaDrawer open={caOpen} onClose={() => setCaOpen(false)} mill="hsm" ca={ca} sources={CA_SOURCES} />
      <CaInputs mill="hsm" open={inputsOpen} onClose={() => setInputsOpen(false)} />
      {/* The mill mimic — the same twin as Visualization — at the bottom of the page (the user, 30 Oct 2026). */}
      <MillMimic>
        <div className="ah-list hca-notes">
          <Row k="Route active" />
          <Row k="Investigation note" />
        </div>
      </MillMimic>
    </div>
  );
}

const n1 = (v: number | null) => (v === null ? '—' : fixed(v, 1));

function RateContent({ days, rate }: { days: RateDay[]; rate: ReturnType<typeof actualRate> }) {
  return (
    <>
      <Stats items={[
        { label: 'Actual rate', value: rate.tph === null ? 'NA' : fixed(rate.tph, 2), unit: 'TPH', tone: rate.tph === null ? 'v-na' : undefined },
        { label: 'ERP production', value: fixed(rate.mt, 1), unit: 'MT' },
        { label: 'Running hours', value: fixed(rate.h, 1), unit: `h · ${rate.days} day${rate.days === 1 ? '' : 's'}` },
      ]} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Actual running rate per day">
          <thead><tr><th>Day</th><th className="r">ERP production (MT)</th><th className="r">Running hours (h)</th><th className="r">Rate (TPH)</th></tr></thead>
          <tbody>
            {days.map((d) => {
              const r = d.erpMt !== null && d.runH ? d.erpMt / d.runH : null;
              return (
                <tr key={d.date}>
                  <td><b>{dm(d.date)}</b></td>
                  <td className={`num r ${d.erpMt === null ? 'v-na' : ''}`}>{n1(d.erpMt)}</td>
                  <td className={`num r ${d.runH === null ? 'v-na' : ''}`}>{n1(d.runH)}</td>
                  <td className={`num r ${r === null ? 'v-na' : 'v-val'}`}>{r === null ? '—' : fixed(r, 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <SourceBox
        sources={[
          { name: 'ERP', rows: [['Table', 'ATTR_TRAN_DATA_HEAD / BODY, TNATURE PRLOG, series L6P (division S1)'], ['Field', 'PRODUCTION_MT, by VRDATE']] },
          { name: 'Influx', rows: [['Tag', 'Dicharged_Billet'], ['Filter', "_measurement = 'HSM', Unit = 'Finishing Mill', Group = 'General'"]] },
        ]}
        formula={[
          'Actual rate = Σ ERP production ÷ Σ running hours, over the days that have both',
          'Running hours = time the mill discharges billets less than 10 min apart (a longer gap is a stop)',
          'Day = 08:00 IST → 08:00 IST',
        ]}
      />
    </>
  );
}
