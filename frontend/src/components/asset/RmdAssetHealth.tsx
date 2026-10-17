'use client';

/**
 * RMD · Asset Health — HSM's layout, with RMD's zones and the sources of RMD FACLON persona - 3
 * (confirmed 14–15 Oct 2026). NA wherever there is no source (MID, ERP PM, VFD trips):
 *   Mimic + status    route / finishing: live drive status (RUNNING_STATUS / *_On_Off);
 *   Bearing temp      the hottest bearing at the latest Mill Bearing Temperature entries of the
 *                     group (logbook tmt-mechanical; roughing = 20" and 16" R stands, route = intermill,
 *                     NC and OC stands); opens every bearing and the trend;
 *   Motor current     average live current feedback of the group's running drives, A; opens each
 *                     drive's current now and its trend while running (status 1) over the period;
 *   Gearbox oil       the lowest oil-tank level of the group (inches), with the temperatures;
 *   Run hours         ERP log sheet ACTUAL_RUNNING_HRS over the period (whole mill); opens per day;
 *   Condition trends  bearing temperature: the hottest bearing of each entry.
 * Clicking a zone selects its drive group. Test entries are left out.
 * Limits (the plant, 16 Oct 2026): bearings 45–65 °C, flywheel 45–80 °C, oil tank temperature
 * 45–65 °C — a card turns red when any of its readings is outside them, green when all are inside.
 */
import { Fragment, useMemo, useState } from 'react';
import Panel from '@/components/Panel';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import FlowArrow from '@/components/visualization/FlowArrow';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox from '@/components/drill/SourceBox';
import { fixed } from '@/lib/num';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmdAssetForms, type RmdLive, type RmdReading } from '@/services/hsmApi';
import { useRmdProduction } from '@/components/rmd/RmdProductionDrawer';
import RmdCurrentDrawer from './RmdCurrentDrawer';
import RmdRunHoursDrawer from './RmdRunHoursDrawer';
import '@/components/visualization/visualization.css';
import '@/components/rmd/rmd.css';
import './asset.css';

const GROUPS = ['Billet infeed', 'Roughing group', 'Route / diverter', 'Finishing group', 'Finished exit'] as const;
type Group = (typeof GROUPS)[number];
/** The zones with live drives, and the zones with mechanical forms. */
const LIVE: Partial<Record<Group, 'route' | 'finishing'>> = { 'Route / diverter': 'route', 'Finishing group': 'finishing' };
const FORMS: Partial<Record<Group, 'roughing' | 'route'>> = { 'Roughing group': 'roughing', 'Route / diverter': 'route' };
const NAME: Record<Group, string> = {
  'Billet infeed': 'Billet infeed', 'Roughing group': 'Roughing', 'Route / diverter': 'Route', 'Finishing group': 'Finishing', 'Finished exit': 'Finished exit',
};

const NA = (label: string, unit: string, series: Series) => <KpiCard key={label} label={label} value="NA" unit={unit} note="" series={series} />;

export default function RmdAssetHealth() {
  const [group, setGroup] = useState<Group>('Route / diverter');
  const [open, setOpen] = useState<'bearing' | 'oil' | 'current' | 'run' | null>(null);
  const zone = LIVE[group] ?? null;
  const fg = FORMS[group] ?? null;
  const { dates } = useSelection();

  const live = useApi<RmdLive>('/api/rmd/live', 30_000).data;
  const formsUrl = rangeUrl('/api/rmd/asset-forms', dates);
  const f = useApi<RmdAssetForms>(formsUrl);
  const forms = f.data && f.dataUrl === formsUrl ? f.data : null;
  const run = useRmdProduction(dates).data?.totals.runningHrs ?? null;

  const zoneLive = zone && live ? live.zones.find((z) => z.id === zone) ?? null : null;
  const running = zone && live ? live.stations.filter((s) => s.zone === zone && s.on && s.currentA !== null) : [];
  const currentA = running.length ? running.reduce((a, s) => a + s.currentA!, 0) / running.length : null;
  const bearing = fg && forms ? forms.bearing[fg] : null;
  const oil = fg && forms ? forms.oil[fg] : null;
  const bearingTone = toneOf(bearing?.latest ?? []);
  const oilTone = toneOf(oil?.temperature ?? []);

  return (
    <div className="rm-viz ah">
      <Panel className="ah-asset" bodyClass="ah-asset-body">
        <div className="ah-asset-id">
          <span className="rm-k">Selected asset</span>
          <h2 className="ah-asset-name">RMD · {NAME[group]} drive group</h2>
          <span className="ah-asset-path">Motor → coupling → gearbox → rolling zone</span>
        </div>
        {zoneLive
          ? <span className={`chip ${zoneLive.state === 'no-data' ? 'chip--na' : 'chip--info'} ah-status`}>{zoneLive.stateLabel}</span>
          : <span className="chip chip--na ah-status">Status NA</span>}
        <dl className="ah-asset-facts">
          {['Last inspection', 'Next PM · ERP', 'Open work orders', 'Health score'].map((k) => (
            <div className="ah-fact" key={k}><dt className="rm-k">{k}</dt><dd className="num v-na">NA</dd></div>
          ))}
        </dl>
      </Panel>

      <section className="rm-strip ah-strip" aria-label="Condition KPIs">
        {NA('Vibration RMS', 'mm/s', 'hold')}
        <KpiCard
          label="Bearing temp"
          value={bearing?.max ? fixed(bearing.max.value, 0) : 'NA'}
          unit="°C"
          note=""
          series="hold"
          tone={bearingTone}
          {...(bearing ? { onOpen: () => setOpen('bearing'), openLabel: 'Every bearing at the latest reading, and the trend' } : {})}
        />
        <KpiCard
          label="Motor current"
          value={currentA === null ? 'NA' : fixed(currentA, 0)}
          unit="A"
          note=""
          series="prod"
          {...(zone ? { onOpen: () => setOpen('current'), openLabel: 'Each drive\'s current now, and its trend while running' } : {})}
        />
        {NA('Alignment', 'mm', 'order')}
        <KpiCard
          label="Gearbox oil"
          value={oil?.minLevel ? fixed(oil.minLevel.value, 1) : 'NA'}
          unit="in"
          note=""
          series="hold"
          tone={oilTone}
          {...(oil ? { onOpen: () => setOpen('oil'), openLabel: 'Each oil tank: level and temperature' } : {})}
        />
        {NA('VFD trips', 'per 100 run h', 'hold')}
        <KpiCard label="Run hours" value={run === null ? 'NA' : fixed(run, 1)} unit="h" note="" series="prod"
          onOpen={() => setOpen('run')} openLabel="Run hours per day, from the ERP log sheet" />
        {NA('PM on time', '%', 'order')}
      </section>

      <Panel title="Grouped asset mimic" sub="Select a group to inspect its motor, coupling, gearbox, bearings and associated records">
        <ol className="rm-mimic rmd-mimic" aria-label="Drive groups">
          {GROUPS.map((g, i) => {
            const zl = LIVE[g] && live ? live.zones.find((z) => z.id === LIVE[g]) ?? null : null;
            const value = zl && zl.state !== 'no-data' ? `${zl.on} of ${zl.total} on` : 'NA';
            return (
              <Fragment key={g}>
                {i > 0 && <li className="rm-mimic-arrow" aria-hidden><FlowArrow /></li>}
                <li className="rm-mimic-cell">
                  <button type="button" className={`rm-zone rm-zone--flow ah-zone${g === group ? ' is-selected' : ''}`} aria-pressed={g === group} onClick={() => setGroup(g)}>
                    <span className="rm-zone-title">{g}</span>
                    <span className="rm-zone-body"><span className={`rm-zone-value num ${value === 'NA' ? 'v-na' : 'v-val'}`}>{value}</span></span>
                  </button>
                </li>
              </Fragment>
            );
          })}
        </ol>
      </Panel>

      <div className="rm-row">
        <Panel title="Condition trends" sub="Bearing temperature, each reading" className="rm-panel" bodyClass="rm-body ah-trends">
          <div className="ah-trend">
            <div className="ah-trend-head"><span className="rm-k">Vibration · mm/s RMS</span><span className="num v-na">NA</span></div>
            <div className="ah-trend-plot" role="img" aria-label="Vibration: no data" />
          </div>
          <BearingTrend trend={bearing?.trend ?? []} />
        </Panel>
        <Panel title="Laser alignment · Machine inspection" className="rm-panel" bodyClass="rm-body ah-pair">
          {['As-found', 'As-left'].map((k) => (
            <div className="ah-figure" key={k}>
              <span className="rm-k">{k}</span>
              <span className="ah-figure-v num v-na">NA</span>
              <span className="ah-figure-sub">Offset | angle <b className="v-na">NA</b></span>
            </div>
          ))}
        </Panel>
      </div>

      <div className="rm-row">
        <Panel title="ERP PM & work-order history" className="rm-panel" bodyClass="rm-body ah-list">
          {['PM completed on time', 'MTBF', 'MTTR', 'Open action'].map((k) => <Row key={k} k={k} />)}
        </Panel>
        <Panel title="Diagnosis & process impact" className="rm-panel" bodyClass="rm-body ah-list">
          {['Diagnosis', 'Asset stop', 'Output effect', 'Value'].map((k) => <Row key={k} k={k} />)}
        </Panel>
      </div>

      {zone && <RmdCurrentDrawer open={open === 'current'} onClose={() => setOpen(null)} zone={zone} />}
      <RmdRunHoursDrawer open={open === 'run'} onClose={() => setOpen(null)} />

      <DrillDrawer open={open === 'bearing'} onClose={() => setOpen(null)} title={`${NAME[group]} · bearing temperature`} sub="RMD · °C"
        loading={!forms} error={f.error} hasData={!!forms}>
        {bearing && <ReadingsTable rows={bearing.latest} unit="°C" label="Bearing temperatures" max={bearing.max} source={[
          ['Form', 'Rolling Mill Division (TMT) → Mechanical → Mill Bearing Temperature'],
          ['Forms', fg === 'roughing' ? '20 Inch R Stand, 16 Inch R Stand' : 'Intermill, New Continuous Stand (1–8), Old Continuous Stand (1–6)'],
          ['Field', 'Flywheel / Reduction gear / Pinion gear, D and ND side (°C) — each form\'s latest entry in the period'],
        ]} formula={['Bearing temp = the hottest of those readings', 'Limits: bearings 45–65 °C, flywheel 45–80 °C (plant)']} />}
      </DrillDrawer>
      <DrillDrawer open={open === 'oil'} onClose={() => setOpen(null)} title={`${NAME[group]} · gearbox oil`} sub="RMD · oil tanks"
        loading={!forms} error={f.error} hasData={!!forms}>
        {oil && (
          <>
            <ReadingsTable rows={oil.level} unit="in" label="Oil tank level" max={null} source={null} formula={null} />
            <ReadingsTable rows={oil.temperature} unit="°C" label="Oil tank temperature" max={null} source={[
              ['Forms', 'Rolling Mill Division (TMT) → Mechanical → Oil Tank → Oil Tank Level (inches, every 15 days), Oil Tank Temperature (°C)'],
              ['Field', 'one value per tank — the latest entry in the period'],
            ]} formula={['Gearbox oil = the lowest tank level of the group (inches)', 'Limits: oil tank temperature 45–65 °C (plant); level — none yet']} />
          </>
        )}
      </DrillDrawer>
    </div>
  );
}

/** v-risk when any reading is outside its limits, v-ok when all with limits are inside; none without limits. */
function toneOf(rows: RmdReading[]): 'v-ok' | 'v-risk' | undefined {
  const judged = rows.filter((r) => r.status !== null);
  if (!judged.length) return undefined;
  return judged.some((r) => r.status !== 'ok') ? 'v-risk' : 'v-ok';
}
const LIMIT_TONE = { ok: 'v-ok', low: 'v-risk', high: 'v-risk' } as const;

function Row({ k }: { k: string }) {
  return <div className="ah-row"><span className="rm-k">{k}</span><span className="num v-na">NA</span></div>;
}

function BearingTrend({ trend }: { trend: { at: string; maxC: number }[] }) {
  const categories = useMemo(() => trend.map((t) => t.at.slice(5)), [trend]);
  const series = useMemo<DrillSeries[]>(() => [{ id: 'bt', name: 'Hottest bearing', token: '--s-order', type: 'line', data: trend.map((t) => t.maxC), dp: 0 }], [trend]);
  const axes = useMemo(() => [{ title: '°C', unit: '°C' }], []);
  const last = trend.at(-1);
  return (
    <div className="ah-trend">
      <div className="ah-trend-head"><span className="rm-k">Bearing temp · °C</span><span className={`num ${last ? 'v-val' : 'v-na'}`}>{last ? fixed(last.maxC, 0) : 'NA'}</span></div>
      {trend.length
        ? <DrillChart series={series} categories={categories} axes={axes} ariaLabel={`Hottest bearing per reading: ${trend.map((t) => `${t.at} ${t.maxC} °C`).join('; ')}`} />
        : <div className="ah-trend-plot" role="img" aria-label="Bearing temperature: no readings" />}
    </div>
  );
}

function ReadingsTable({ rows, unit, label, max, source, formula }: {
  rows: RmdReading[]; unit: string; label: string; max: RmdReading | null;
  source: [string, string][] | null; formula: string[] | null;
}) {
  return (
    <>
      {max && <Stats items={[
        { label: 'Hottest', value: fixed(max.value, 0), unit, tone: max.status ? LIMIT_TONE[max.status] : undefined },
        { label: 'At', value: max.equipment, unit: max.point, wrap: true },
      ]} />}
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label={label}>
          <thead><tr><th>Equipment</th><th>Point</th><th className="r">{unit}</th><th className="r">Limits</th><th>Date</th></tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={5} className="v-na">NA</td></tr>
              : rows.map((r, i) => (
                <tr key={i}>
                  <td><b>{r.equipment}</b></td><td>{r.point}</td>
                  <td className={`num r ${r.status ? LIMIT_TONE[r.status] : 'v-val'}`}>{fixed(r.value, unit === 'in' ? 1 : 0)}</td>
                  <td className="num r">{r.min === null ? '—' : `${r.min}–${r.max}`}</td>
                  <td>{r.at}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {source && <SourceBox sources={[{ name: 'Logbook', rows: source }]} formula={formula ?? []} />}
    </>
  );
}
