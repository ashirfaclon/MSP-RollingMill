'use client';

/**
 * LSM · Asset Health — HSM's layout, wired only from the sources the LSM asset health sheet names
 * (asset health.xlsx, the plant, 21 Oct 2026). NA everywhere else, never a sample figure:
 *   Bearing temp   LSM Mechanical → Drive Temp: the hottest bearing (flywheel, reduction gearbox,
 *                  pinion gearbox, DE / NDE) at each drive's latest reading, °C; opens every drive;
 *                  the Condition trend is the hottest of each reading;
 *   Gearbox oil    the same form, a Level / Pressure switch (the user, 28 Oct 2026): the lowest oil
 *                  level (inches, as filled — the user, 22 Oct 2026) or the lowest oil pressure
 *                  (kg/cm²) at each drive's latest reading;
 *   Motor current  LSM Electrical Logbook → Mill Load Log Sheet (the plant, 23 Oct 2026): the mean
 *                  load of the passes at the latest reading, A; opens every stand and pass;
 *   Run hours      ERP log sheet NET_RUNNING_HRS over the period.
 * The sheet maps no drive to a mill section, so the figures cover every drive. No mill mimic on
 * LSM (the user, 23 Oct 2026). Vibration from MID; PM items on ERP PM.
 */
import { useMemo, useState } from 'react';
import BearingTrendAll, { lsmBearingPoints } from './BearingTrendAll';
import { lastFigure, useLastEntry } from '@/services/lastEntry';
import LsmMillLoadDrawer from './LsmMillLoadDrawer';
import FlipKpiCard from './FlipKpiCard';
import Panel from '@/components/Panel';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import SourceBox from '@/components/drill/SourceBox';
import { fixed } from '@/lib/num';
import { dm, useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type LsmDriveReading, type LsmDriveReport, type LsmMillLoadReport, type LsmProductionReport } from '@/services/hsmApi';
import '@/components/visualization/visualization.css';
import '@/components/rmd/rmd.css';
import { useMid } from './useMid';
import { MidVibrationDrawer, MidVibrationTrend, midDate, MidRemarks } from './MidVibration';
import { ErpPmDrawer, ErpPmRows, PmOnTimeCard, pmFacts, usePm } from './ErpPm';
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
  const [vibOpen, setVibOpen] = useState(false);
  const mid = useMid('lsm', 'all');
  const pm = usePm('lsm');
  const pmFact = pmFacts(pm);
  const [pmOpen, setPmOpen] = useState(false);

  const loadUrl = rangeUrl('/api/lsm/mill-load', dates);
  const loadS = useApi<LsmMillLoadReport>(loadUrl);
  const load = loadS.data && loadS.dataUrl === loadUrl ? loadS.data : null;
  const currentA = load?.latest?.meanA ?? null;

  const driveUrl = rangeUrl('/api/lsm/drive-temp', dates);
  const driveS = useApi<LsmDriveReport>(driveUrl);
  const drives = driveS.data && driveS.dataUrl === driveUrl ? driveS.data : null;
  const prodUrl = rangeUrl('/api/lsm/production', dates ? { ...dates, grain: 'day' } : null);
  const prodS = useApi<LsmProductionReport>(prodUrl);
  const prodD = prodS.data && prodS.dataUrl === prodUrl ? prodS.data : null;
  const runH = prodD ? prodD.totals.runningHrs : null;
  const prodLast = useLastEntry<LsmProductionReport>('/api/lsm/production', !!prodD && prodD.totals.entryDays === 0, prodD?.erp.lastDate, dates?.from, 'grain=day');

  /* The card figures from a drive-temp report: the hottest bearing, the lowest oil level and pressure. */
  const figures = (r: LsmDriveReport | null) => {
    const l = r?.latest ?? [];
    const ts = l.map(hottest).filter((v): v is number => v !== null);
    return { bearingC: ts.length ? Math.max(...ts) : null, levelIn: lowest(l.map((e) => e.oilLevelIn)), pressure: lowest(l.map((e) => e.oilPressure)) };
  };
  const latest = drives?.latest ?? [];
  const { bearingC, levelIn, pressure } = figures(drives);
  /* Nothing filled in the period: the last day each form has (the user, 30 Oct 2026). */
  const driveLast = useLastEntry<LsmDriveReport>('/api/lsm/drive-temp', !!drives && drives.latest.length === 0, drives?.lastDate, dates?.from);
  const loadLast = useLastEntry<LsmMillLoadReport>('/api/lsm/mill-load', !!load && currentA === null, load?.lastDate, dates?.from);
  // Every bearing of every drive, each reading (the user, 31 Oct 2026).
  const trend = useMemo(() => (drives ? lsmBearingPoints(drives.entries) : []), [drives]);
  const opener = drives ? { onOpen: () => setOpen(true), openLabel: 'Each drive: bearing temperatures and gearbox oil' } : {};

  return (
    <div className="rm-viz ah">
      <Panel className="ah-asset" bodyClass="ah-asset-body">
        <div className="ah-asset-id">
          <span className="rm-k">Selected asset</span>
          <h2 className="ah-asset-name">LSM · mill drives</h2>
        </div>
        <dl className="ah-asset-facts">
          {([['Last inspection', midDate(mid.date)], ['Next PM · ERP', pmFact.nextPm], ['Open work orders', pmFact.openWorkOrders]] as const).map(([k, v]) => (
            <div className="ah-fact" key={k}><dt className="rm-k">{k}</dt><dd className={`num ${v ? 'v-val' : 'v-na'}`}>{v ?? 'NA'}</dd></div>
          ))}
        </dl>
      </Panel>

      <section className="rm-strip ah-strip" aria-label="Condition KPIs">
        <KpiCard label="Vibration RMS" value={mid.maxMmS === null ? 'NA' : fixed(mid.maxMmS, 1)} unit="mm/s" note="" series="hold" noEntries={!!mid.report && mid.maxMmS === null}
          {...(mid.machines.length ? { onOpen: () => setVibOpen(true), openLabel: 'Each machine at the last MID visit' } : {})} />
        <MidVibrationDrawer open={vibOpen} onClose={() => setVibOpen(false)} title="LSM · mill" mid={mid} />
        <KpiCard label="Bearing temp" value={bearingC === null ? 'NA' : fixed(bearingC, 0)} unit="°C" note="" series="hold" noEntries={!!drives && bearingC === null}
          lastEntry={lastFigure(bearingC, driveLast, (d) => figures(d).bearingC, (n) => fixed(n, 0))} {...opener} />
        <KpiCard label="Motor current" value={currentA === null ? 'NA' : fixed(currentA, 0)} unit="A" note="" series="prod" noEntries={!!load && currentA === null}
          lastEntry={lastFigure(currentA, loadLast, (d) => d.latest?.meanA, (n) => fixed(n, 0))}
          {...(load ? { onOpen: () => setLoadOpen(true), openLabel: 'Each stand and pass: load at the latest reading' } : {})} />
        <LsmMillLoadDrawer open={loadOpen} onClose={() => setLoadOpen(false)} report={load} loading={!loadS.data && !loadS.error} error={loadS.error} />
        {/* Level or pressure (the user, 28 Oct 2026): the card turns over between them. */}
        <FlipKpiCard
          label="Gearbox oil"
          series="hold"
          faces={[
            { id: 'level', label: 'Level', title: 'The lowest oil level (inches, as filled)', card: { value: levelIn === null ? 'NA' : fixed(levelIn, 1), unit: 'in', noEntries: !!drives && levelIn === null, lastEntry: lastFigure(levelIn, driveLast, (d) => figures(d).levelIn, (n) => fixed(n, 1)) } },
            { id: 'pressure', label: 'Pressure', title: 'The lowest oil pressure (kg/cm²)', card: { value: pressure === null ? 'NA' : fixed(pressure, 1), unit: 'kg/cm²', noEntries: !!drives && pressure === null, lastEntry: lastFigure(pressure, driveLast, (d) => figures(d).pressure, (n) => fixed(n, 1)) } },
          ]}
          {...opener}
        />
        <KpiCard label="Run hours" value={runH == null ? 'NA' : fixed(runH, 1)} unit="h" note="" series="prod"
          noEntries={!!prodS.data && prodS.dataUrl === prodUrl && runH == null}
          lastEntry={lastFigure(runH, prodLast, (d) => d.totals.runningHrs, (n) => fixed(n, 1))} />
        <PmOnTimeCard pm={pm} onOpen={() => setPmOpen(true)} />
        <ErpPmDrawer open={pmOpen} onClose={() => setPmOpen(false)} pm={pm} runH={runH} title="LSM" />
      </section>

      <div className="rm-row ah-row--one">
        <Panel title="Condition trends" sub="Every machine and every bearing" className="rm-panel" bodyClass="rm-body ah-trends">
          <MidVibrationTrend mid={mid} />
          <BearingTrendAll points={trend} />
        </Panel>
      </div>

      <div className="rm-row">
        <Panel title="ERP PM & work-order history" className="rm-panel" bodyClass="rm-body ah-list">
          <ErpPmRows pm={pm} runH={runH} onOpen={() => setPmOpen(true)} />
        </Panel>
        <Panel title="Remarks" className="rm-panel" bodyClass="rm-body ah-list ah-list--top">
          <MidRemarks mid={mid} />
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

