'use client';

/**
 * HSM · Condition Analytics — the layout of HSM_Condition_Analytics_Dashboard.png, sources exactly
 * as the HSM sheet (HSM source KPI.xlsx, Condition Analytics). Wired only where the sheet's own
 * source exists; NA everywhere else, never a sample figure:
 *   Actual running rate  ERP FG posted MT (log sheet PRODUCTION_MT) ÷ running hours from the
 *                        historian (Dicharged_Billet: billets ≤ 10 min apart — the Visualization
 *                        running hours), over the days that have both; opens per day;
 *   Finished exit        "Row 10" — the actual running rate;
 *   Product header       ERP size (PROD_TRAN receipts, the most produced strip size, and how
 *                        many others) and the running hours; grade and route are not in the ERP data.
 * Waiting on the plant / ERP: matched (stable-run) baselines, EMS energy, ERP cost masters, approved
 * limits, the stand map and route layout, the machine inspection form.
 */
import { Fragment, useMemo, useState } from 'react';
import Panel from '@/components/Panel';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import FlowArrow from '@/components/visualization/FlowArrow';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import SourceBox from '@/components/drill/SourceBox';
import { fixed } from '@/lib/num';
import { dm, useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RateDay, type RunningRateReport, type SizeReport } from '@/services/hsmApi';
import '@/components/visualization/visualization.css';
import '@/components/rmd/rmd.css';
import '@/components/asset/asset.css';
import './condition.css';

const NA = (label: string, unit: string, series: Series) => <KpiCard key={label} label={label} value="NA" unit={unit} note="" series={series} />;
const Row = ({ k }: { k: string }) => <div className="ah-row"><span className="rm-k">{k}</span><span className="num v-na">NA</span></div>;

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

  const rate = useMemo(() => (rateR ? actualRate(rateR.days) : null), [rateR]);
  const tph = rate?.tph ?? null;
  const top = sizes?.length ? [...sizes].sort((a, b) => b.producedMt - a.producedMt)[0] : null;
  const runH = rateR?.totals.runH ?? null;

  const zones: { title: string; value: string; foot: string }[] = [
    { title: 'Billet infeed', value: 'NA', foot: 'feed context' },
    { title: 'Roughing group', value: 'NA', foot: 'current / RPM' },
    { title: 'Intermediate group', value: 'NA', foot: 'load' },
    { title: 'Finishing group', value: 'NA', foot: 'speed' },
    { title: 'Finished exit', value: tph === null ? 'NA' : `${fixed(tph, 2)} TPH`, foot: 'actual rate' },
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
          unit="TPH"
          note=""
          series="prod"
          loading={!rateS.data && !rateS.error}
          onOpen={() => setOpen(true)}
          openLabel="Actual running rate per day"
        />
        {NA('Output opportunity', 'MT', 'order')}
        {NA('Specific energy', 'kWh/MT', 'hold')}
        {NA('Conversion cost', '₹/MT', 'prod')}
        {NA('Cost variance', '₹/MT', 'hold')}
        {NA('Yield material loss', '₹', 'hold')}
        {NA('Output margin', '₹', 'order')}
      </section>

      <div className="rm-row">
        <Panel title="Matched-run performance" className="rm-panel" bodyClass="rm-body ah-list ah-list--top">
          {['Production rate · actual vs matched', 'Energy per MT · actual vs matched'].map((k) => <Row key={k} k={k} />)}
        </Panel>
        <Panel title="Costing & impact" className="rm-panel" bodyClass="rm-body ah-list ah-list--top">
          {['Tariff', 'Contribution', 'Net material', 'Other conversion · actual / standard', 'Conversion cost per finished MT',
            'Cost variance', 'Yield material variance', 'Throughput contribution opportunity'].map((k) => <Row key={k} k={k} />)}
        </Panel>
      </div>

      <Panel title="Grouped condition mimic">
        <ol className="rm-mimic rmd-mimic" aria-label="Condition groups">
          {zones.map((z, i) => (
            <Fragment key={z.title}>
              {i > 0 && <li className="rm-mimic-arrow" aria-hidden><FlowArrow /></li>}
              <li className="rm-mimic-cell">
                <div className="rm-zone rm-zone--flow">
                  <span className="rm-zone-title">{z.title}</span>
                  <span className="rm-zone-body"><span className={`rm-zone-value num ${z.value === 'NA' ? 'v-na' : 'v-val'}`}>{z.value}</span></span>
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

      <DrillDrawer open={open} onClose={() => setOpen(false)} title="Actual running rate" sub="HSM · TPH"
        loading={!rateS.data && !rateS.error} error={rateS.error} hasData={!!rateR}>
        {rateR && rate && <RateContent days={rateR.days} rate={rate} />}
      </DrillDrawer>
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
