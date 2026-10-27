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
 * Waiting on the plant: the benchmark (matched) rate — output opportunity, matched-run performance;
 * the cost figures — conversion cost, cost variance, yield material loss, output margin, costing &
 * impact.
 */
import { Fragment, useState } from 'react';
import Panel from '@/components/Panel';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import FlowArrow from '@/components/visualization/FlowArrow';
import SpecificEnergyCard from '@/components/production/SpecificEnergyCard';
import DrillDrawer from '@/components/drill/DrillDrawer';
import SourceBox, { type SourceSystem } from '@/components/drill/SourceBox';
import { fixed } from '@/lib/num';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmdBilletsReport, type RmdConditionGroup, type RmdConditionReport, type RmdLive, type RmdRunningRateReport } from '@/services/hsmApi';
import RmdRunningRateDrawer from './RmdRunningRateDrawer';
import '@/components/visualization/visualization.css';
import './rmd.css';
import '@/components/asset/asset.css';

const NA = (label: string, unit: string, series: Series) => <KpiCard key={label} label={label} value="NA" unit={unit} note="" series={series} />;
const Row = ({ k }: { k: string }) => <div className="ah-row"><span className="rm-k">{k}</span><span className="num v-na">NA</span></div>;

export default function RmdConditionAnalytics() {
  const { dates } = useSelection();
  const rateUrl = rangeUrl('/api/rmd/running-rate', dates ? { ...dates, grain: 'day' } : null);
  const billetsUrl = rangeUrl('/api/rmd/billets', dates ? { ...dates, grain: 'day' } : null);
  const condUrl = rangeUrl('/api/rmd/condition', dates);
  const rateS = useApi<RmdRunningRateReport>(rateUrl);
  const billetsS = useApi<RmdBilletsReport>(billetsUrl);
  const condS = useApi<RmdConditionReport>(condUrl);
  const live = useApi<RmdLive>('/api/rmd/live', 30_000).data;
  const rate = rateS.data && rateS.dataUrl === rateUrl ? rateS.data.totals : null;
  const billets = billetsS.data && billetsS.dataUrl === billetsUrl ? billetsS.data.totals.totalPcs : null;
  const cond = condS.data && condS.dataUrl === condUrl ? condS.data : null;
  const [open, setOpen] = useState<'rate' | 'finishing' | null>(null);

  const perHour = billets !== null && rate?.runH ? billets / rate.runH : null;
  // Route / diverter: the CR Mill stands' running status now (line 1 = M1 S1–S8, line 2 = M2 S1–S6).
  const route = live?.stations.filter((s) => s.zone === 'route') ?? [];
  const zoneNow = live?.zones.find((z) => z.id === 'route') ?? null;
  const routeState = !zoneNow || zoneNow.state === 'no-data' ? 'NA' : `${zoneNow.on} of ${zoneNow.total} on`;
  const onIn = (l: 1 | 2) => `L${l} ${route.filter((s) => s.line === l && s.on).length} of ${route.filter((s) => s.line === l).length}`;
  const fin = cond?.finishing ?? null;
  const rpm = (g: RmdConditionGroup | null) => (g ? [1, 2].map((l) => `L${l} ${g.meanRpmByLine[l] == null ? '—' : fixed(g.meanRpmByLine[l], 0)}`).join(' · ') + ' RPM' : '');

  const zones: { title: string; value: string; foot: string; open?: () => void; openLabel?: string }[] = [
    { title: 'Billet infeed', value: perHour === null ? 'NA' : `${fixed(perHour, 0)} billets/h`, foot: 'billets per running hour' },
    { title: 'Route / diverter', value: routeState, foot: routeState === 'NA' ? 'running status now' : `${onIn(1)} · ${onIn(2)}` },
    {
      title: 'Finishing group', value: fin?.meanA == null ? 'NA' : `${fixed(fin.meanA, 0)} A`, foot: fin?.meanA == null ? 'current / RPM' : rpm(fin),
      open: () => setOpen('finishing'), openLabel: 'Each finishing drive: current and speed while running',
    },
    { title: 'Finished exit', value: rate?.rateTph == null ? 'NA' : `${fixed(rate.rateTph, 2)} TPH`, foot: 'actual rate' },
  ];

  return (
    <div className="rm-viz">
      <section className="rm-strip" aria-label="Condition KPIs">
        <KpiCard
          label="Actual rate"
          value={rate?.rateTph == null ? 'NA' : fixed(rate.rateTph, 2)}
          unit="TPH"
          note=""
          series="prod"
          loading={!rateS.data && !rateS.error}
          onOpen={() => setOpen('rate')}
          openLabel="Running rate per day"
        />
        {NA('Output opportunity', 'MT', 'order')}
        <SpecificEnergyCard mill="rmd" />
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
        <ol className="rm-mimic rmd-mimic rmd-mimic--four" aria-label="Condition groups">
          {zones.map((z, i) => {
            const body = (
              <>
                <span className="rm-zone-title">{z.title}</span>
                <span className="rm-zone-body"><span className={`rm-zone-value num ${z.value === 'NA' ? 'v-na' : 'v-val'}`}>{z.value}</span></span>
                <span className="rm-zone-foot">{z.foot}</span>
              </>
            );
            return (
              <Fragment key={z.title}>
                {i > 0 && <li className="rm-mimic-arrow" aria-hidden><FlowArrow /></li>}
                <li className="rm-mimic-cell">
                  {z.open
                    ? <button type="button" className="rm-zone rm-zone--flow" onClick={z.open} aria-haspopup="dialog" aria-label={z.title} title={z.openLabel}>{body}</button>
                    : <div className="rm-zone rm-zone--flow">{body}</div>}
                </li>
              </Fragment>
            );
          })}
        </ol>
      </Panel>

      <RmdRunningRateDrawer open={open === 'rate'} onClose={() => setOpen(null)} />
      <DrillDrawer open={open === 'finishing'} onClose={() => setOpen(null)} title="Finishing group · current and speed" sub="RMD · A · RPM"
        loading={!condS.data && !condS.error} error={condS.error} hasData={!!cond}>
        {fin && <DrivesTable g={fin} sources={FINISHING_SOURCES} />}
      </DrillDrawer>
    </div>
  );
}

/** Each drive: mean current and speed while running over the period. */
const FINISHING_SOURCES: SourceSystem[] = [
  { name: 'Influx · line 1', rows: [['Tag', 'CUR_FB_FS / PR1 / PR2 / TB1 / TB2, SPD_FB_FS / PR1 / PR2 / TB1 / TB2; RUNNING_STATUS_… for running'], ['Filter', "_measurement = 'TMT-RMD', Unit = 'Line-1', Group = 'M1'"]] },
  { name: 'Influx · line 2', rows: [['Tag', 'CS / Pinch_Roll_Pre / Pinch_Roll_Post / Tail_Break_01 / Tail_Break_02 _Current and _RPM; …_On_Off for running'], ['Filter', "_measurement = 'TMT-RMD', Unit = 'Line-2', Group = 'General'"]] },
];

function DrivesTable({ g, sources }: { g: RmdConditionGroup; sources: SourceSystem[] }) {
  return (
    <>
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Drives: current and speed while running">
          <thead><tr><th>Line</th><th>Drive</th><th className="r">Current (A)</th><th className="r">Speed (RPM)</th></tr></thead>
          <tbody>
            {g.drives.map((d) => (
              <tr key={d.id}>
                <td>Line {d.line}</td>
                <td><b>{d.label}</b></td>
                <td className={`num r ${d.meanA === null ? 'v-na' : 'v-val'}`}>{d.meanA === null ? 'Not running' : fixed(d.meanA, 0)}</td>
                <td className="num r">{d.meanRpm === null ? '—' : fixed(d.meanRpm, 0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={2}>Group ({g.ran} ran)</td><td className="num r">{g.meanA === null ? '—' : fixed(g.meanA, 0)}</td><td className="num r">—</td></tr></tfoot>
        </table>
      </div>
      <SourceBox
        sources={sources}
        formula={[
          'Current and speed count only while the drive runs: all three are averaged per minute, and a minute counts when the drive ran all of it',
          'Group current = mean of the drives that ran; speed shown per line (the lines read on different scales)',
          'Day = 08:00 IST → 08:00 IST',
        ]}
      />
    </>
  );
}
