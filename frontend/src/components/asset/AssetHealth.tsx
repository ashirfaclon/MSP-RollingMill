'use client';

/**
 * HSM · Asset Health — the layout of the approved mock-up (HSM_Asset_Health_Dashboard.png), wired
 * only from the sources the HSM sheet names (HSM source KPI.xlsx, Asset Health; the user,
 * 21 Oct 2026). NA everywhere else, never a sample figure:
 *   Bearing temp       Mill Load Log Sheet: the hottest DC motor DE / NDE temperature at the
 *                      selected group's stands' latest readings, °C; opens every stand, and the
 *                      Condition trend is the hottest of each reading. (Deviation from a
 *                      comparable-load baseline once the form has history.)
 *   Motor current      Mill Load Log Sheet: mean load (A) at the group's stands' latest readings;
 *                      as % once each motor's rated current is given.
 *   Run hours          ERP log sheet NET_RUNNING_HRS over the period (whole mill).
 * The stand name places a reading in its group (RM → roughing, FM → finishing). Clicking a zone
 * selects its drive group. Vibration and alignment wait on MID; PM items on ERP PM; the rest have
 * no source in the sheet.
 */
import { Fragment, useMemo, useState } from 'react';
import Panel from '@/components/Panel';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import FlowArrow from '@/components/visualization/FlowArrow';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox from '@/components/drill/SourceBox';
import { fixed } from '@/lib/num';
import { dm, useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type HsmMillLoadEntry, type HsmMillLoadReport, type RunningRateReport } from '@/services/hsmApi';
import '@/components/visualization/visualization.css';
import '@/components/rmd/rmd.css';
import './asset.css';

const GROUPS = ['Billet infeed', 'Roughing group', 'Intermediate group', 'Finishing group', 'Finished exit'] as const;
type Group = (typeof GROUPS)[number];
/** The zones whose stands the Mill Load Log Sheet covers. */
const STANDS: Partial<Record<Group, 'roughing' | 'finishing'>> = { 'Roughing group': 'roughing', 'Finishing group': 'finishing' };

const NA = (label: string, unit: string, series: Series) => <KpiCard key={label} label={label} value="NA" unit={unit} note="" series={series} />;
/** The hotter of a reading's DE and NDE temperature; null without either. */
const hottest = (e: HsmMillLoadEntry) => {
  const t = [e.deTempC, e.ndeTempC].filter((v): v is number => v !== null);
  return t.length ? Math.max(...t) : null;
};

export default function AssetHealth() {
  const [group, setGroup] = useState<Group>('Finishing group');
  const [open, setOpen] = useState(false);
  const drive = group.replace(/ group$/, '');
  const gid = STANDS[group] ?? null;
  const { dates } = useSelection();

  const loadUrl = rangeUrl('/api/hsm/mill-load', dates);
  const loadS = useApi<HsmMillLoadReport>(loadUrl);
  const load = loadS.data && loadS.dataUrl === loadUrl ? loadS.data : null;
  const rateUrl = rangeUrl('/api/hsm/running-rate', dates ? { ...dates, grain: 'day' } : null);
  const rateS = useApi<RunningRateReport>(rateUrl);
  const runH = rateS.data && rateS.dataUrl === rateUrl ? rateS.data.totals.erpRunH : null;

  const latest = gid && load ? load.latest.filter((e) => e.group === gid) : [];
  const temps = latest.map(hottest).filter((v): v is number => v !== null);
  const bearingC = temps.length ? Math.max(...temps) : null;
  const loads = latest.map((e) => e.loadA).filter((v): v is number => v !== null);
  const loadA = loads.length ? loads.reduce((a, b) => a + b, 0) / loads.length : null;
  const trend = gid && load ? load.entries.filter((e) => e.group === gid && hottest(e) !== null) : [];
  const canOpen = !!gid && !!load;

  return (
    <div className="rm-viz ah">
      <Panel className="ah-asset" bodyClass="ah-asset-body">
        <div className="ah-asset-id">
          <span className="rm-k">Selected asset</span>
          <h2 className="ah-asset-name">HSM · {drive} drive group</h2>
        </div>
        <span className="chip chip--na ah-status">Status NA</span>
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
          value={bearingC === null ? 'NA' : fixed(bearingC, 0)}
          unit="°C"
          note=""
          series="hold"
          {...(canOpen ? { onOpen: () => setOpen(true), openLabel: 'Each stand: load and DC motor temperatures' } : {})}
        />
        <KpiCard
          label="Motor current"
          value={loadA === null ? 'NA' : fixed(loadA, 0)}
          unit="A"
          note=""
          series="prod"
          {...(canOpen ? { onOpen: () => setOpen(true), openLabel: 'Each stand: load and DC motor temperatures' } : {})}
        />
        {NA('Alignment', 'mm', 'order')}
        {NA('Gearbox oil', '', 'hold')}
        {NA('VFD trips', 'per 100 run h', 'hold')}
        <KpiCard label="Run hours" value={runH == null ? 'NA' : fixed(runH, 1)} unit="h" note="" series="prod" />
        {NA('PM on time', '%', 'order')}
      </section>

      <Panel title="Grouped asset mimic">
        <ol className="rm-mimic rmd-mimic" aria-label="Drive groups">
          {GROUPS.map((g, i) => (
            <Fragment key={g}>
              {i > 0 && <li className="rm-mimic-arrow" aria-hidden><FlowArrow /></li>}
              <li className="rm-mimic-cell">
                <button type="button" className={`rm-zone rm-zone--flow ah-zone${g === group ? ' is-selected' : ''}`} aria-pressed={g === group} onClick={() => setGroup(g)}>
                  <span className="rm-zone-title">{g}</span>
                  <span className="rm-zone-body"><span className="rm-zone-value num v-na">NA</span></span>
                </button>
              </li>
            </Fragment>
          ))}
        </ol>
      </Panel>

      <div className="rm-row">
        <Panel title="Condition trends" sub="Bearing temperature, each reading" className="rm-panel" bodyClass="rm-body ah-trends">
          <div className="ah-trend">
            <div className="ah-trend-head"><span className="rm-k">Vibration · mm/s RMS</span><span className="num v-na">NA</span></div>
            <div className="ah-trend-plot" role="img" aria-label="Vibration: no data" />
          </div>
          <BearingTrend entries={trend} />
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

      <DrillDrawer open={open} onClose={() => setOpen(false)} title={`${drive} · mill load`} sub="HSM · A · °C"
        loading={!loadS.data && !loadS.error} error={loadS.error} hasData={!!load}>
        {load && (
          <>
            <Stats items={[
              { label: 'Motor current', value: loadA === null ? 'NA' : fixed(loadA, 0), unit: 'A · mean of stands', tone: loadA === null ? 'v-na' : undefined },
              { label: 'Hottest bearing', value: bearingC === null ? 'NA' : fixed(bearingC, 0), unit: '°C · DC motor', tone: bearingC === null ? 'v-na' : undefined },
            ]} />
            <div className="pd-table-wrap">
              <table className="grid pd-table" aria-label="Mill load per stand">
                <thead><tr><th>Stand</th><th className="r">Load (A)</th><th className="r">DC motor DE (°C)</th><th className="r">DC motor NDE (°C)</th><th>Reading</th></tr></thead>
                <tbody>
                  {latest.length === 0
                    ? <tr><td colSpan={5} className="v-na">NA</td></tr>
                    : latest.map((e) => (
                      <tr key={e.stand}>
                        <td><b>{e.stand}</b></td>
                        <td className="num r">{e.loadA === null ? '—' : fixed(e.loadA, 0)}</td>
                        <td className="num r">{e.deTempC === null ? '—' : fixed(e.deTempC, 0)}</td>
                        <td className="num r">{e.ndeTempC === null ? '—' : fixed(e.ndeTempC, 0)}</td>
                        <td>{dm(e.date)}{e.time ? ` · ${e.time.slice(11, 16)}` : ''} · {e.shift}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <SourceBox
              sources={[{ name: 'Logbook', rows: [
                ['Form', 'Electrical HSM → Mill Load Log Sheet'],
                ['Field', 'stand name, load in amp, DC motor DE temp, DC motor NDE temp — by the form\'s date'],
              ] }]}
              formula={[
                'Each stand\'s latest reading of the period; RM stands = roughing, FM stands = finishing',
                'Motor current = mean load of the group\'s stands (A); % loading once rated currents are given',
                'Bearing temp = the hottest DC motor DE / NDE temperature of the group\'s stands',
              ]}
            />
            {load.logbook.connection === 'down' && <p className="v-warn">{load.logbook.message}</p>}
          </>
        )}
      </DrillDrawer>
    </div>
  );
}

function BearingTrend({ entries }: { entries: HsmMillLoadEntry[] }) {
  const categories = useMemo(() => entries.map((e) => `${dm(e.date)}${e.time ? ` ${e.time.slice(11, 16)}` : ''} ${e.stand}`), [entries]);
  const series = useMemo<DrillSeries[]>(() => [{ id: 'bt', name: 'Hottest DC motor bearing', token: '--s-order', type: 'line', data: entries.map(hottest), dp: 0 }], [entries]);
  const axes = useMemo(() => [{ title: '°C', unit: '°C' }], []);
  const last = entries.at(-1);
  return (
    <div className="ah-trend">
      <div className="ah-trend-head">
        <span className="rm-k">Bearing temp · °C</span>
        <span className={`num ${last ? 'v-val' : 'v-na'}`}>{last ? fixed(hottest(last), 0) : 'NA'}</span>
      </div>
      {entries.length
        ? <DrillChart series={series} categories={categories} axes={axes} ariaLabel={`Hottest DC motor bearing per reading: ${entries.map((e) => `${e.date} ${e.stand} ${hottest(e)} °C`).join('; ')}`} />
        : <div className="ah-trend-plot" role="img" aria-label="Bearing temperature: no readings" />}
    </div>
  );
}

function Row({ k }: { k: string }) {
  return <div className="ah-row"><span className="rm-k">{k}</span><span className="num v-na">NA</span></div>;
}
