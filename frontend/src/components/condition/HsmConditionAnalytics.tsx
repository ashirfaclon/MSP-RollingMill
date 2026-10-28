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
 *                        26 Oct 2026): billets since 06:00, RM / FM drives on (On_Off);
 *   Specific energy      the logbook Electrical HSM → Power Consumption ÷ ERP production, over the
 *                        days with both (the plant has no EMS meter; the user, 26 Oct 2026);
 *   Conversion cost,     the plant's monthly costing sheet (2026 Costing - SEP26.xlsx, 27 Oct 2026):
 *   Yield material loss, conversion cost ₹/MT, the losses' ₹ (MT × ₹/MT), tariff, other conversion
 *   costing rows         and net material rates — for a period whose months all have a sheet;
 *   Product header       ERP size (PROD_TRAN receipts, the most produced strip size, and how
 *                        many others) and the running hours; grade and route are not in the ERP data.
 * Waiting on the plant / ERP: matched (stable-run) baselines and target kWh/MT, standard cost and
 * tariff, output margin / contribution, approved limits, the stand map and route layout, the machine
 * inspection form.
 */
import { Fragment, useMemo, useState } from 'react';
import CaInputs from './CaInputs';
import '@/components/plan/plan.css';
import Panel from '@/components/Panel';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import HsmSpecificEnergy from './HsmSpecificEnergy';
import HsmCostingDrawer from './HsmCostingDrawer';
import FlowArrow from '@/components/visualization/FlowArrow';
import { StandDots, TONE } from '@/components/visualization/MillMimic';
import { useHsmMimic } from '@/components/visualization/useHsmMimic';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import SourceBox from '@/components/drill/SourceBox';
import { fixed } from '@/lib/num';
import { dm, useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type CostingReport, type RateDay, type RunningRateReport, type SizeReport } from '@/services/hsmApi';
import '@/components/visualization/visualization.css';
import '@/components/rmd/rmd.css';
import '@/components/asset/asset.css';
import './condition.css';

const NA = (label: string, unit: string, series: Series) => <KpiCard key={label} label={label} value="NA" unit={unit} note="" series={series} />;
const Row = ({ k, v = null }: { k: string; v?: string | null }) => (
  <div className="ah-row"><span className="rm-k">{k}</span><span className={`num ${v === null ? 'v-na' : 'v-val'}`}>{v ?? 'NA'}</span></div>
);
const inr = (v: number, dp = 0) => `₹${v.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

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
  const costUrl = rangeUrl('/api/hsm/costing', dates);
  const costS = useApi<CostingReport>(costUrl);
  const cost = costS.data && costS.dataUrl === costUrl ? costS.data : null;
  const cp = cost?.period ?? null;
  // Net material rates as the sheet prices the losses (burning loss apart from the scrap-type losses).
  const rates = cost?.sheets.length === 1 ? cost.sheets[0].losses : null;
  const burning = rates?.find((l) => l.name === 'Burning loss')?.rate ?? null;
  const scrap = rates?.find((l) => l.name !== 'Burning loss')?.rate ?? null;

  const rate = useMemo(() => (rateR ? actualRate(rateR.days) : null), [rateR]);
  const tph = rate?.tph ?? null;
  const top = sizes?.length ? [...sizes].sort((a, b) => b.producedMt - a.producedMt)[0] : null;
  const runH = rateR?.totals.runH ?? null;

  // Billet infeed and the two stand groups: the Visualization mimic's Influx tags (the user, 26 Oct 2026).
  const mimic = useHsmMimic();
  const groupZone = (id: 'roughing' | 'finishing', title: string) => {
    const g = mimic.group(id);
    const on = g && g.state !== 'no-data';
    return { title, value: on ? g.stateLabel : 'NA', foot: on ? `${g.on} of ${g.total} on` : 'drives on / off', tone: g ? TONE[g.state] : 'flow', stands: on ? id : null };
  };
  const zones: { title: string; value: string; foot: string; tone: string; stands: 'roughing' | 'finishing' | null }[] = [
    { title: 'Billet infeed', value: mimic.billetsToday === null ? 'NA' : `${mimic.billetsToday} billets`, foot: 'Today · since 06:00 IST', tone: 'flow', stands: null },
    groupZone('roughing', 'Roughing group'),
    groupZone('finishing', 'Finishing group'),
    { title: 'Finished exit', value: tph === null ? 'NA' : `${fixed(tph, 2)} TPH`, foot: 'actual rate', tone: 'flow', stands: null },
  ];

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
          unit="TPH"
          note=""
          series="prod"
          loading={!rateS.data && !rateS.error}
          onOpen={() => setOpen(true)}
          openLabel="Actual running rate per day"
        />
        {NA('Output opportunity', 'MT', 'order')}
        <HsmSpecificEnergy />
        <KpiCard label="Conversion cost" value={cp ? fixed(cp.conversionPerMt, 0) : 'NA'} unit="₹/MT" note="" series="prod"
          noEntries={cost && !cp ? 'No costing sheet for this period' : false}
          loading={!costS.data && !costS.error} onOpen={() => setCostOpen(true)} openLabel="The plant's costing sheet, line by line" />
        {NA('Cost variance', '₹/MT', 'hold')}
        <KpiCard label="Yield material loss" value={cp ? fixed(cp.materialLossRs / 1e5, 2) : 'NA'} unit="₹ lakh" note="" series="hold"
          noEntries={cost && !cp ? 'No costing sheet for this period' : false}
          onOpen={() => setCostOpen(true)} openLabel="The plant's costing sheet, line by line" />
        {NA('Output margin', '₹', 'order')}
      </section>

      <div className="rm-row">
        <Panel title="Matched-run performance" className="rm-panel" bodyClass="rm-body ah-list ah-list--top">
          {['Production rate · actual vs matched', 'Energy per MT · actual vs matched'].map((k) => <Row key={k} k={k} />)}
        </Panel>
        <Panel title="Costing & impact" className="rm-panel" bodyClass="rm-body ah-list ah-list--top" right={<button type="button" className="rm-plan-edit" aria-haspopup="dialog" onClick={() => setInputsOpen(true)} title="Targets and costs for the month">Edit inputs</button>}>
          <Row k="Tariff" v={cp ? `${inr(cp.tariffPerKwh, 2)}/kWh` : null} />
          <Row k="Contribution" />
          <Row k="Net material" v={burning !== null && scrap !== null ? `${inr(burning)}/MT burning loss · ${inr(scrap)}/MT other losses` : null} />
          <Row k="Other conversion · actual / standard" v={cp ? `${inr(cp.otherConversionPerMt)}/MT · standard NA` : null} />
          {/* No repeats of the Conversion cost, Cost variance and Output margin cards (the user, 28 Oct 2026). */}
          <Row k="Yield material variance" />
        </Panel>
      </div>

      <Panel title="Grouped condition mimic">
        <ol className="rm-mimic rmd-mimic rmd-mimic--four" aria-label="Condition groups">
          {zones.map((z, i) => (
            <Fragment key={z.title}>
              {i > 0 && <li className="rm-mimic-arrow" aria-hidden><FlowArrow /></li>}
              <li className="rm-mimic-cell">
                <div className={`rm-zone rm-zone--${z.tone}`}>
                  <span className="rm-zone-title">{z.title}</span>
                  <span className="rm-zone-body">
                    <span className={`rm-zone-value num ${z.value === 'NA' ? 'v-na' : 'v-val'}`}>{z.value}</span>
                    {z.stands && <StandDots stands={mimic.stands(z.stands)} />}
                  </span>
                  <span className="rm-zone-foot">{z.foot}</span>
                </div>
              </li>
            </Fragment>
          ))}
        </ol>
        <div className="ah-list hca-notes">
          <Row k="Route active" />
          <Row k="Investigation note" />
        </div>
      </Panel>

      <HsmCostingDrawer open={costOpen} onClose={() => setCostOpen(false)} report={cost} loading={!costS.data && !costS.error} error={costS.error} />
      <DrillDrawer open={open} onClose={() => setOpen(false)} title="Actual running rate" sub="HSM · TPH"
        loading={!rateS.data && !rateS.error} error={rateS.error} hasData={!!rateR}>
        {rateR && rate && <RateContent days={rateR.days} rate={rate} />}
      </DrillDrawer>
      <CaInputs mill="hsm" open={inputsOpen} onClose={() => setInputsOpen(false)} />
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
          'Day = 06:00 IST → 06:00 IST',
        ]}
      />
    </>
  );
}
