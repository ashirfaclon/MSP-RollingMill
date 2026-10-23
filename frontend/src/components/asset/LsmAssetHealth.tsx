'use client';

/**
 * LSM · Asset Health — HSM's layout, wired only from the sources the LSM asset health sheet names
 * (asset health.xlsx, the plant, 21 Oct 2026). NA everywhere else, never a sample figure:
 *   Bearing temp   LSM Mechanical → Drive Temp: the hottest bearing (flywheel, reduction gearbox,
 *                  pinion gearbox, DE / NDE) at each drive's latest reading, °C; opens every drive;
 *                  the Condition trend is the hottest of each reading;
 *   Gearbox oil    the same form: the lowest oil level (inches, as filled — the user, 22 Oct 2026)
 *                  and the lowest oil pressure (kg/cm²) at each drive's latest reading;
 *   Motor current  LSM Electrical Logbook → Mill Load Log Sheet (the plant, 23 Oct 2026): the mean
 *                  load of the passes at the latest reading, A; opens every stand and pass;
 *   Run hours      ERP log sheet NET_RUNNING_HRS over the period.
 * The sheet maps no drive to a mill section, so the figures cover every drive. No mill mimic on
 * LSM (the user, 23 Oct 2026). Vibration and alignment wait on MID; PM items on ERP PM.
 */
import { useMemo, useState } from 'react';
import LsmMillLoadDrawer from './LsmMillLoadDrawer';
import Panel from '@/components/Panel';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox from '@/components/drill/SourceBox';
import { fixed } from '@/lib/num';
import { dm, useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type LsmDriveReading, type LsmDriveReport, type LsmMillLoadReport, type LsmProductionReport } from '@/services/hsmApi';
import '@/components/visualization/visualization.css';
import '@/components/rmd/rmd.css';
import './asset.css';

const NA = (label: string, unit: string, series: Series) => <KpiCard key={label} label={label} value="NA" unit={unit} note="" series={series} />;
/** The hottest of a reading's six bearings; null without any. */
const hottest = (e: LsmDriveReading) => {
  const t = [e.flywheelDeC, e.flywheelNdeC, e.reductionDeC, e.reductionNdeC, e.pinionDeC, e.pinionNdeC].filter((v): v is number => v !== null);
  return t.length ? Math.max(...t) : null;
};
const lowest = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.min(...v) : null;
};
const c0 = (v: number | null) => (v === null ? '—' : fixed(v, 0));
const time = (at: string) => `${dm(at.slice(0, 10))} · ${at.slice(11, 16)}`;

export default function LsmAssetHealth() {
  const [open, setOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const { dates } = useSelection();

  const loadUrl = rangeUrl('/api/lsm/mill-load', dates);
  const loadS = useApi<LsmMillLoadReport>(loadUrl);
  const load = loadS.data && loadS.dataUrl === loadUrl ? loadS.data : null;
  const currentA = load?.latest?.meanA ?? null;

  const driveUrl = rangeUrl('/api/lsm/drive-temp', dates);
  const driveS = useApi<LsmDriveReport>(driveUrl);
  const drives = driveS.data && driveS.dataUrl === driveUrl ? driveS.data : null;
  const prodUrl = rangeUrl('/api/lsm/production', dates ? { ...dates, grain: 'day' } : null);
  const prodS = useApi<LsmProductionReport>(prodUrl);
  const runH = prodS.data && prodS.dataUrl === prodUrl ? prodS.data.totals.runningHrs : null;

  const latest = drives?.latest ?? [];
  const temps = latest.map(hottest).filter((v): v is number => v !== null);
  const bearingC = temps.length ? Math.max(...temps) : null;
  const levelIn = lowest(latest.map((e) => e.oilLevelIn));
  const pressure = lowest(latest.map((e) => e.oilPressure));
  const trend = drives ? drives.entries.filter((e) => hottest(e) !== null) : [];
  const opener = drives ? { onOpen: () => setOpen(true), openLabel: 'Each drive: bearing temperatures and gearbox oil' } : {};

  return (
    <div className="rm-viz ah">
      <Panel className="ah-asset" bodyClass="ah-asset-body">
        <div className="ah-asset-id">
          <span className="rm-k">Selected asset</span>
          <h2 className="ah-asset-name">LSM · mill drives</h2>
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
        <KpiCard label="Bearing temp" value={bearingC === null ? 'NA' : fixed(bearingC, 0)} unit="°C" note="" series="hold" {...opener} />
        <KpiCard label="Motor current" value={currentA === null ? 'NA' : fixed(currentA, 0)} unit="A" note="" series="prod"
          {...(load ? { onOpen: () => setLoadOpen(true), openLabel: 'Each stand and pass: load at the latest reading' } : {})} />
        <LsmMillLoadDrawer open={loadOpen} onClose={() => setLoadOpen(false)} report={load} loading={!loadS.data && !loadS.error} error={loadS.error} />
        {NA('Alignment', 'mm', 'order')}
        <KpiCard
          label="Gearbox oil"
          value=""
          unit=""
          note=""
          series="hold"
          pair={[
            { source: 'Level · in', value: levelIn === null ? 'NA' : fixed(levelIn, 1) },
            { source: 'Pressure · kg/cm²', value: pressure === null ? 'NA' : fixed(pressure, 1) },
          ]}
          {...opener}
        />
        {NA('VFD trips', 'per 100 run h', 'hold')}
        <KpiCard label="Run hours" value={runH == null ? 'NA' : fixed(runH, 1)} unit="h" note="" series="prod" />
        {NA('PM on time', '%', 'order')}
      </section>

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

      <DrillDrawer open={open} onClose={() => setOpen(false)} title="Mill drives · bearings and gearbox oil" sub="LSM · °C · in · kg/cm²"
        loading={!driveS.data && !driveS.error} error={driveS.error} hasData={!!drives}>
        {drives && (
          <>
            <Stats items={[
              { label: 'Hottest bearing', value: bearingC === null ? 'NA' : fixed(bearingC, 0), unit: '°C', tone: bearingC === null ? 'v-na' : undefined },
              { label: 'Lowest oil level', value: levelIn === null ? 'NA' : fixed(levelIn, 1), unit: 'in', tone: levelIn === null ? 'v-na' : undefined },
              { label: 'Lowest oil pressure', value: pressure === null ? 'NA' : fixed(pressure, 1), unit: 'kg/cm²', tone: pressure === null ? 'v-na' : undefined },
            ]} />
            <h3 className="rm-k">Bearing temperature · °C</h3>
            <div className="pd-table-wrap">
              <table className="grid pd-table" aria-label="Drives: bearing temperatures">
                <thead>
                  <tr>
                    <th>Drive</th>
                    <th className="r">Flywheel DE</th><th className="r">Flywheel NDE</th>
                    <th className="r">Reduction DE</th><th className="r">Reduction NDE</th>
                    <th className="r">Pinion DE</th><th className="r">Pinion NDE</th>
                  </tr>
                </thead>
                <tbody>
                  {latest.length === 0
                    ? <tr><td colSpan={7} className="v-na">NA</td></tr>
                    : latest.map((e) => (
                      <tr key={e.drive}>
                        <td><b>{e.drive || '—'}</b></td>
                        {[e.flywheelDeC, e.flywheelNdeC, e.reductionDeC, e.reductionNdeC, e.pinionDeC, e.pinionNdeC].map((v, i) => <td key={i} className="num r">{c0(v)}</td>)}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <h3 className="rm-k">Gearbox oil</h3>
            <div className="pd-table-wrap">
              <table className="grid pd-table" aria-label="Drives: gearbox oil">
                <thead><tr><th>Drive</th><th className="r">Level (in)</th><th className="r">Pressure (kg/cm²)</th><th>Reading</th></tr></thead>
                <tbody>
                  {latest.length === 0
                    ? <tr><td colSpan={4} className="v-na">NA</td></tr>
                    : latest.map((e) => (
                      <tr key={e.drive}>
                        <td><b>{e.drive || '—'}</b></td>
                        <td className="num r">{e.oilLevelIn === null ? '—' : fixed(e.oilLevelIn, 1)}</td>
                        <td className="num r">{e.oilPressure === null ? '—' : fixed(e.oilPressure, 1)}</td>
                        <td>{time(e.at)} · {e.shift}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <SourceBox
              sources={[{ name: 'Logbook', rows: [
                ['Form', 'Light Structure Mill → LSM Mechanical → Drive Temp'],
                ['Field', 'drive name; flywheel, reduction gearbox and pinion gearbox bearing DE / NDE (°C); oil level (inches); oil pressure (kg/cm²)'],
              ] }]}
              formula={[
                'Each drive\'s latest reading of the period, placed by its date-time (day = 09:00 → 09:00 IST)',
                'Bearing temp = the hottest of the six bearings over all drives (°C)',
                'Gearbox oil = the lowest oil level (inches, as filled) and the lowest oil pressure over all drives',
              ]}
            />
            {drives.logbook.connection === 'down' && <p className="v-warn">{drives.logbook.message}</p>}
          </>
        )}
      </DrillDrawer>
    </div>
  );
}

function BearingTrend({ entries }: { entries: LsmDriveReading[] }) {
  const categories = useMemo(() => entries.map((e) => `${time(e.at)} ${e.drive}`), [entries]);
  const series = useMemo<DrillSeries[]>(() => [{ id: 'bt', name: 'Hottest drive bearing', token: '--s-order', type: 'line', data: entries.map(hottest), dp: 0 }], [entries]);
  const axes = useMemo(() => [{ title: '°C', unit: '°C' }], []);
  const last = entries.at(-1);
  return (
    <div className="ah-trend">
      <div className="ah-trend-head">
        <span className="rm-k">Bearing temp · °C</span>
        <span className={`num ${last ? 'v-val' : 'v-na'}`}>{last ? fixed(hottest(last), 0) : 'NA'}</span>
      </div>
      {entries.length
        ? <DrillChart series={series} categories={categories} axes={axes} ariaLabel={`Hottest drive bearing per reading: ${entries.map((e) => `${e.at} ${e.drive} ${hottest(e)} °C`).join('; ')}`} />
        : <div className="ah-trend-plot" role="img" aria-label="Bearing temperature: no readings" />}
    </div>
  );
}

function Row({ k }: { k: string }) {
  return <div className="ah-row"><span className="rm-k">{k}</span><span className="num v-na">NA</span></div>;
}
