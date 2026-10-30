'use client';

/**
 * RMD · Asset Health — HSM's layout, with RMD's zones and the sources of RMD FACLON persona - 3
 * (confirmed 14–15 Oct 2026). NA wherever there is no source (MID, ERP PM):
 *   Drive group       chosen in the header (the user, 28 Oct 2026), not on the mimic: roughing
 *                     (20" / 16" R stands — no PLC, so no live status or current), route /
 *                     diverter, finishing, auxiliary (MID's pumps);
 *   Mimic + status    as the Visualization mimic, no roughing group (the user, 27 Oct 2026), display
 *                     only: billet infeed = billets since 09:00 IST; route / finishing = live drive
 *                     status (RUNNING_STATUS / *_On_Off); finished exit = ERP production for the period;
 *   Bearing temp      the hottest bearing at the latest Mill Bearing Temperature entries of the
 *                     group (logbook tmt-mechanical; roughing = 20" and 16" R stands, route =
 *                     intermill, NC and OC stands); opens every bearing and the trend;
 *   Motor current     average live current feedback of the group's running drives, A; opens each
 *                     drive's current now and its trend while running (status 1) over the period;
 *   Gearbox oil       a switch (the plant, 28 Oct 2026): Level = the oil (litres) in the group's tank
 *                     lowest against its capacity — the level (inches) × the tank's inside length ×
 *                     width; Temp = the hottest tank's oil temperature, against 45–65 °C;
 *   Run hours         ERP log sheet ACTUAL_RUNNING_HRS over the period (whole mill); opens per day;
 *   Condition trends  bearing temperature: the hottest bearing of each entry.
 * Test entries are left out.
 * Limits (the plant, 16 Oct 2026): bearings 45–65 °C, flywheel 45–80 °C, oil tank temperature
 * 45–65 °C — a card turns red when any of its readings is outside them, green when all are inside.
 */
import { useMemo, useState } from 'react';
import { lastFigure, useLastEntry } from '@/services/lastEntry';
import Panel from '@/components/Panel';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import DrillDrawer, { Seg, Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox from '@/components/drill/SourceBox';
import { fixed } from '@/lib/num';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmdAssetForms, type RmdConditionReport, type RmdLive, type RmdReading } from '@/services/hsmApi';
import { dm } from '@/lib/plantDay';
import { useRmdProduction } from '@/components/rmd/RmdProductionDrawer';
import RmdCurrentDrawer from './RmdCurrentDrawer';
import RmdRunHoursDrawer from './RmdRunHoursDrawer';
import FlipKpiCard from './FlipKpiCard';
import '@/components/visualization/visualization.css';
import '@/components/rmd/rmd.css';
import { useMid } from './useMid';
import { MidVibrationDrawer, MidVibrationTrend, midDate, MidRemarks } from './MidVibration';
import { ErpPmDrawer, ErpPmRows, PmOnTimeCard, pmFacts, usePm } from './ErpPm';
import './asset.css';

/** The drive groups the header selects; each is also its MID section (the plant's machine list, 27 Oct 2026). */
type Group = 'roughing' | 'route' | 'finishing' | 'auxiliary';
const GROUPS: { id: Group; label: string }[] = [
  { id: 'roughing', label: 'Roughing' }, { id: 'route', label: 'Route / diverter' }, { id: 'finishing', label: 'Finishing' }, { id: 'auxiliary', label: 'Auxiliary' },
];
/** The groups with live drives, and the groups with mechanical forms. */
const LIVE: Partial<Record<Group, 'route' | 'finishing'>> = { route: 'route', finishing: 'finishing' };
const FORMS: Partial<Record<Group, 'roughing' | 'route'>> = { roughing: 'roughing', route: 'route' };
const NAME: Record<Group, string> = { roughing: 'Roughing', route: 'Route', finishing: 'Finishing', auxiliary: 'Auxiliary' };
/**
 * Which condition cards each group shows (the user, 30 Oct 2026): Roughing has no motor current;
 * Finishing no bearing temperature or gearbox oil; Auxiliary none of the three. Route keeps all.
 */
const CARDS: Record<Group, { bearing: boolean; current: boolean; oil: boolean }> = {
  roughing: { bearing: true, current: false, oil: true },
  route: { bearing: true, current: true, oil: true },
  finishing: { bearing: false, current: true, oil: false },
  auxiliary: { bearing: false, current: false, oil: false },
};
const STRIP: Record<number, string> = { 6: '', 5: ' ah-strip--five', 4: ' ah-strip--four', 3: ' ah-strip--three' };

const NA = (label: string, unit: string, series: Series) => <KpiCard key={label} label={label} value="NA" unit={unit} note="" series={series} />;

export default function RmdAssetHealth() {
  const [group, setGroup] = useState<Group>('route');
  const show = CARDS[group];
  const [open, setOpen] = useState<'bearing' | 'oil' | 'current' | 'run' | null>(null);
  const zone = LIVE[group] ?? null;
  const fg = FORMS[group] ?? null;
  const { dates } = useSelection();
  const [vibOpen, setVibOpen] = useState(false);
  const mid = useMid('rmd', group);
  const pm = usePm('rmd');
  const pmFact = pmFacts(pm);
  const [pmOpen, setPmOpen] = useState(false);

  const live = useApi<RmdLive>('/api/rmd/live', 30_000).data;
  const formsUrl = rangeUrl('/api/rmd/asset-forms', dates);
  const f = useApi<RmdAssetForms>(formsUrl);
  const forms = f.data && f.dataUrl === formsUrl ? f.data : null;
  const prodR = useRmdProduction(dates);
  const totals = prodR.data?.totals;
  const run = totals?.runningHrs ?? null;

  const zoneLive = zone && live ? live.zones.find((z) => z.id === zone) ?? null : null;
  // Live: the group's drives running now, from a fresh reading only.
  const running = zone && live?.fresh ? live.stations.filter((s) => s.zone === zone && s.on && s.currentA !== null) : [];
  const currentA = running.length ? running.reduce((a, s) => a + s.currentA!, 0) / running.length : null;
  // Not live: the group's mean current while running over the period — the Condition Analytics figure (CR Mill stands = route).
  const condUrl = rangeUrl('/api/rmd/condition', zone ? dates : null);
  const condS = useApi<RmdConditionReport>(condUrl);
  const cond = condS.data && condS.dataUrl === condUrl ? condS.data : null;
  const periodA = zone === 'route' ? cond?.stands.meanA : zone === 'finishing' ? cond?.finishing.meanA : null;
  const motorA = currentA ?? periodA ?? null;
  const bearing = fg && forms ? forms.bearing[fg] : null;
  const oil = fg && forms ? forms.oil[fg] : null;
  const bearingTone = toneOf(bearing?.latest ?? []);
  const oilTone = toneOf(oil?.temperature ?? []);
  const oilTempC = oil?.temperature.length ? Math.max(...oil.temperature.map((r) => r.value)) : null;
  /* Nothing filled in the period: the last day each form has, per group (the user, 30 Oct 2026). */
  const bearingMax = bearing?.max?.value ?? null;
  const oilLevelL = oil?.minLevel?.litres ?? null;
  const bearingLast = useLastEntry<RmdAssetForms>('/api/rmd/asset-forms', !!bearing && bearingMax === null, bearing?.lastDate, dates?.from);
  const levelLast = useLastEntry<RmdAssetForms>('/api/rmd/asset-forms', !!oil && oilLevelL === null, oil?.levelLastDate, dates?.from);
  const tempLast = useLastEntry<RmdAssetForms>('/api/rmd/asset-forms', !!oil && oilTempC === null, oil?.temperatureLastDate, dates?.from);
  const hottestOil = (d: RmdAssetForms) => { const t = fg ? d.oil[fg].temperature : []; return t.length ? Math.max(...t.map((r) => r.value)) : null; };
  /** The card's view when it was opened: the drill-down shows that one only. */
  const [oilView, setOilView] = useState<'level' | 'temp'>('level');

  return (
    <div className="rm-viz ah">
      <Panel className="ah-asset" bodyClass="ah-asset-body">
        <div className="ah-asset-id">
          <span className="rm-k">Selected asset</span>
          <h2 className="ah-asset-name">RMD · {group === 'auxiliary' ? 'Auxiliary · pumps' : `${NAME[group]} drive group`}</h2>
          <Seg label="Drive group" value={group} onChange={setGroup} options={GROUPS} />
        </div>
        {/* Status only where there is a source (the user, 28 Oct 2026): route / finishing drives — none for roughing (no PLC) or the pumps. */}
        {zone && (zoneLive && zoneLive.state !== 'no-data'
          ? <span className="chip chip--info ah-status">{zoneLive.stateLabel}</span>
          : <span className="chip chip--na ah-status">No live data</span>)}
        <dl className="ah-asset-facts">
          {([['Last inspection', midDate(mid.date)], ['Next PM · ERP', pmFact.nextPm], ['Open work orders', pmFact.openWorkOrders]] as const).map(([k, v]) => (
            <div className="ah-fact" key={k}><dt className="rm-k">{k}</dt><dd className={`num ${v ? 'v-val' : 'v-na'}`}>{v ?? 'NA'}</dd></div>
          ))}
        </dl>
      </Panel>

      <section className={`rm-strip ah-strip${STRIP[3 + Number(show.bearing) + Number(show.current) + Number(show.oil)]}`} aria-label="Condition KPIs">
        <KpiCard label="Vibration RMS" value={mid.maxMmS === null ? 'NA' : fixed(mid.maxMmS, 1)} unit="mm/s" note="" series="hold" noEntries={!!mid.report && mid.maxMmS === null}
          {...(mid.machines.length ? { onOpen: () => setVibOpen(true), openLabel: 'Each machine at the last MID visit' } : {})} />
        <MidVibrationDrawer open={vibOpen} onClose={() => setVibOpen(false)} title={`${NAME[group]} group`} mid={mid} />
        {show.bearing && <KpiCard
          label="Bearing temp"
          value={bearing?.max ? fixed(bearing.max.value, 0) : 'NA'}
          lastEntry={lastFigure(bearingMax, bearingLast, (d) => (fg ? d.bearing[fg].max?.value : null), (n) => fixed(n, 0))}
          noEntries={!!fg && !!forms && !bearing?.max}
          unit="°C"
          note=""
          series="hold"
          tone={bearingTone}
          {...(bearing ? { onOpen: () => setOpen('bearing'), openLabel: 'Every bearing at the latest reading, and the trend' } : {})}
        />}
        {/* Live while any of the group's drives runs; otherwise the mean while running over the selected dates (the user, 28 Oct 2026). */}
        {show.current && <KpiCard
          label="Motor current"
          value={motorA === null ? 'NA' : fixed(motorA, 0)}
          unit="A"
          note={currentA !== null
            ? <span className="chip chip--ok" title="Live: the drives running now">Live</span>
            : periodA != null && dates
              ? <span className="chip chip--info" title="Not live: the mean while running over the selected dates">Avg · {dm(dates.from)}–{dm(dates.to)}</span>
              : ''}
          noEntries={!!zone && currentA === null && !!cond && periodA == null ? 'Not run in this period' : false}
          loading={!!zone && currentA === null && !cond && !condS.error}
          series="prod"
          {...(zone ? { onOpen: () => setOpen('current'), openLabel: 'Each drive\'s current now, and its trend while running' } : {})}
        />}
        {/* Level or temperature (the plant, 28 Oct 2026). Limits exist for the temperature only (45–65 °C): no colour on the level. */}
        {show.oil && <FlipKpiCard
          label="Gearbox oil"
          series="hold"
          faces={[
            { id: 'level', label: 'Level', title: 'Oil in the tank lowest against its capacity (L)',
              card: { value: oil?.minLevel?.litres != null ? fixed(oil.minLevel.litres, 0) : 'NA', unit: 'L', noEntries: !!fg && !!forms && oil?.minLevel?.litres == null,
                lastEntry: lastFigure(oilLevelL, levelLast, (d) => (fg ? d.oil[fg].minLevel?.litres : null), (n) => fixed(n, 0)) } },
            { id: 'temp', label: 'Temp', title: 'The hottest oil tank (°C)',
              card: { value: oilTempC !== null ? fixed(oilTempC, 0) : 'NA', unit: '°C', tone: oilTempC !== null ? oilTone : undefined, noEntries: !!fg && !!forms && oilTempC === null,
                lastEntry: lastFigure(oilTempC, tempLast, hottestOil, (n) => fixed(n, 0)) } },
          ]}
          {...(oil ? { onOpen: (v: 'level' | 'temp') => { setOilView(v); setOpen('oil'); }, openLabel: 'Each oil tank, for the view shown' } : {})}
        />}
        <KpiCard label="Run hours" value={run === null ? 'NA' : fixed(run, 1)} unit="h" note="" series="prod" noEntries={!!totals && run === null}
          lastEntry={lastFigure(run, prodR.last, (d) => d.totals.runningHrs, (n) => fixed(n, 1))}
          onOpen={() => setOpen('run')} openLabel="Run hours per day, from the ERP log sheet" />
        <PmOnTimeCard pm={pm} onOpen={() => setPmOpen(true)} />
        <ErpPmDrawer open={pmOpen} onClose={() => setPmOpen(false)} pm={pm} runH={run} title="RMD" />
      </section>

      <div className="rm-row ah-row--one">
        <Panel title="Condition trends" sub={show.bearing ? 'Bearing temperature, each reading' : undefined} className="rm-panel" bodyClass="rm-body ah-trends">
          <MidVibrationTrend mid={mid} />
          {show.bearing && <BearingTrend trend={bearing?.trend ?? []} />}
        </Panel>
      </div>

      <div className="rm-row">
        <Panel title="ERP PM & work-order history" className="rm-panel" bodyClass="rm-body ah-list">
          <ErpPmRows pm={pm} runH={run} onOpen={() => setPmOpen(true)} />
        </Panel>
        <Panel title="Remarks" className="rm-panel" bodyClass="rm-body ah-list ah-list--top">
          <MidRemarks mid={mid} />
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
      {/* One screen per view of the card (the plant, 29 Oct 2026): oil level, or oil temperature. */}
      <DrillDrawer open={open === 'oil'} onClose={() => setOpen(null)}
        title={`${NAME[group]} · ${oilView === 'level' ? 'oil level' : 'oil temperature'}`} sub={oilView === 'level' ? 'RMD · oil tanks · in · L' : 'RMD · oil tanks · °C'}
        loading={!forms} error={f.error} hasData={!!forms}>
        {oil && oilView === 'level' && (
          <>
            <TankLevelTable rows={oil.level} />
            <SourceBox
              sources={[{ name: 'Logbook', rows: [
                ['Form', 'Rolling Mill Division (TMT) → Mechanical → Oil Tank → Oil Tank Level (inches, every 15 days)'],
                ['Field', 'one value per tank — the latest entry in the period'],
              ] }]}
              formula={[
                'Oil (L) = level (inches) × 0.0254 × inside length × inside width (m) × 1000 — box tanks, flat bottom, level from the bottom',
                fg === 'roughing'
                  ? 'Tank size (L × W × D, m): 20" / 16" R stand 1.63 × 1.26 × 1.30 (2,670 L)'
                  : 'Tank size (L × W × D, m): Intermill 1.25 × 1.01 × 1.01 (1,275 L); NC / OC stands 1.26 × 0.85 × 0.87 (932 L)',
                'Gearbox oil (Level) = the oil in the tank lowest against its capacity',
                'Limits: level — none given yet',
              ]}
            />
          </>
        )}
        {oil && oilView === 'temp' && (
          <ReadingsTable rows={oil.temperature} unit="°C" label="Oil tank temperature" max={null} source={[
            ['Form', 'Rolling Mill Division (TMT) → Mechanical → Oil Tank → Oil Tank Temperature (°C)'],
            ['Field', 'one value per tank — the latest entry in the period'],
          ]} formula={[
            'Gearbox oil (Temp) = the hottest oil tank',
            'Limits: oil tank temperature 45–65 °C (plant)',
          ]} />
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

/** Oil tank level: the reading (inches), the oil in litres and the capacity (no "Full" column — the user, 29 Oct 2026). */
function TankLevelTable({ rows }: { rows: RmdReading[] }) {
  return (
    <div className="pd-table-wrap">
      <table className="grid pd-table" aria-label="Oil tank level">
        <thead><tr><th>Tank</th><th className="r">Level (in)</th><th className="r">Oil (L)</th><th className="r">Capacity (L)</th><th>Date</th></tr></thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={5} className="v-na">NA</td></tr>
            : rows.map((r, i) => (
              <tr key={i}>
                <td><b>{r.equipment}</b></td>
                <td className="num r">{fixed(r.value, 1)}</td>
                <td className="num r v-val">{fixed(r.litres ?? null, 0)}</td>
                <td className="num r">{fixed(r.capacityL ?? null, 0)}</td>
                <td>{r.at}</td>
              </tr>
            ))}
        </tbody>
      </table>
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
