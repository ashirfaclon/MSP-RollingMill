'use client';

/**
 * RMS · Asset Health — HSM's layout, wired only from the sources the RMS sheet names (R.M.S.xlsx,
 * Asset Health; the user, 26 Oct 2026):
 *   Run hours      ERP log sheet NET_RUNNING_HRS over the period (division RS, series L5P).
 *   Bearing temp   logbook Rolling Mill Structure (RMS) → RMS Mechanical → Drive Temp (the user, 31 Oct
 *                  2026): the hottest bearing at each drive's latest reading; opens every bearing.
 *   Gearbox oil    the same form: oil temperature and oil pressure, the card turns over between them.
 * Motor current is NA (no source); vibration from MID. No mill mimic on RMS
 * (the user, 23 Oct 2026). No VFD trips card on any mill (the user, 28 Oct 2026).
 */
import { useMemo, useState } from 'react';
import { midTop, rmsHottest, whenText, withWhere } from './cardWhere';
import { lastFigure, useLastEntry } from '@/services/lastEntry';
import Panel from '@/components/Panel';
import KpiCard, { type Series } from '@/components/visualization/KpiCard';
import { fixed } from '@/lib/num';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmsDriveReading, type RmsDriveReport, type RmsProductionReport } from '@/services/hsmApi';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import SourceBox from '@/components/drill/SourceBox';
import FlipKpiCard from './FlipKpiCard';
import BearingTrendAll, { rmsBearingPoints } from './BearingTrendAll';
import { dm } from '@/lib/plantDay';
import '@/components/visualization/visualization.css';
import { useMid } from './useMid';
import { MidVibrationDrawer, MidVibrationTrend, midDate, MidRemarks, remarkSummary } from './MidVibration';
import { ErpPmDrawer, ErpPmRows, PmOnTimeCard, usePm } from './ErpPm';
import './asset.css';

const NA = (label: string, unit: string, series: Series) => <KpiCard key={label} label={label} value="NA" unit={unit} note="" series={series} />;

export default function RmsAssetHealth() {
  const { dates } = useSelection();
  const [vibOpen, setVibOpen] = useState(false);
  const mid = useMid('rms', 'all');
  const pm = usePm('rms');
  const [pmOpen, setPmOpen] = useState(false);
  const url = rangeUrl('/api/rms/production', dates ? { ...dates, grain: 'day' } : null);
  const prodS = useApi<RmsProductionReport>(url);
  const prodD = prodS.data && prodS.dataUrl === url ? prodS.data : null;
  const runH = prodD ? prodD.totals.runningHrs : null;
  const prodLast = useLastEntry<RmsProductionReport>('/api/rms/production', !!prodD && prodD.totals.entryDays === 0, prodD?.erp.lastDate, dates?.from, 'grain=day');

  /* RMS Mechanical → Drive Temp (the user, 31 Oct 2026): bearings and gearbox oil, per drive. */
  const driveUrl = rangeUrl('/api/rms/drive-temp', dates);
  const driveS = useApi<RmsDriveReport>(driveUrl);
  const drives = driveS.data && driveS.dataUrl === driveUrl ? driveS.data : null;
  const figures = (r: RmsDriveReport | null) => {
    const l = r?.latest ?? [];
    const temps = l.flatMap((e) => e.bearings.map((b) => b.valueC));
    const oilT = l.map((e) => e.oilTempC).filter((v): v is number => v !== null);
    const oilP = l.map((e) => e.oilPressure).filter((v): v is number => v !== null);
    return {
      bearingC: temps.length ? Math.max(...temps) : null,
      oilTempC: oilT.length ? Math.max(...oilT) : null,
      oilPressure: oilP.length ? Math.min(...oilP) : null,
    };
  };
  const { bearingC, oilTempC, oilPressure } = figures(drives);
  const driveLast = useLastEntry<RmsDriveReport>('/api/rms/drive-temp', !!drives && drives.latest.length === 0, drives?.lastDate, dates?.from);
  const trend = useMemo(() => (drives ? rmsBearingPoints(drives.entries) : []), [drives]);
  const [driveOpen, setDriveOpen] = useState(false);
  const opener = drives ? { onOpen: () => setDriveOpen(true), openLabel: 'Each drive: every bearing and the gearbox oil' } : {};
  const loading = !driveS.data && !driveS.error;

  return (
    <div className="rm-viz ah">
      {/* No "Selected asset" panel: last inspection is on the Vibration card, next PM and open work orders in ERP PM (the user, 31 Oct 2026). */}
      <section className="rm-strip ah-strip" aria-label="Condition KPIs">
        <KpiCard label="Vibration RMS" value={mid.maxMmS === null ? 'NA' : fixed(mid.maxMmS, 1)} unit="mm/s" series="hold" noEntries={!!mid.report && mid.maxMmS === null}
          /* The machine with the highest reading, and the MID visit it is from (the user, 31 Oct 2026). */
          note="" where={(() => { const t = midTop(mid.machines, mid.date); return t ? { name: t.where, when: `MID · ${midDate(t.date)}` } : null; })()}
          {...(mid.machines.length ? { onOpen: () => setVibOpen(true), openLabel: 'Each machine at the last MID visit' } : {})} />
        <MidVibrationDrawer open={vibOpen} onClose={() => setVibOpen(false)} title="RMS · mill" mid={mid} />
        <KpiCard label="Bearing temp" value={bearingC === null ? 'NA' : fixed(bearingC, 0)} unit="°C" note="" series="hold" loading={loading}
          noEntries={!!drives && bearingC === null}
          lastEntry={withWhere(lastFigure(bearingC, driveLast, (d) => figures(d).bearingC, (n) => fixed(n, 0)), driveLast.data ? rmsHottest(driveLast.data.latest) : null)}
          where={(() => { const h = rmsHottest(drives?.latest ?? []); return h ? { name: h.where, when: whenText(h) } : null; })()} {...opener} />
        {NA('Motor current', 'A', 'prod')}
        {/* Temperature or pressure: the card turns over between them. */}
        <FlipKpiCard
          label="Gearbox oil"
          series="hold"
          faces={[
            { id: 'temp', label: 'Temp', title: 'The hottest gearbox oil (°C)', card: { value: oilTempC === null ? 'NA' : fixed(oilTempC, 1), unit: '°C', loading, noEntries: !!drives && oilTempC === null, lastEntry: lastFigure(oilTempC, driveLast, (d) => figures(d).oilTempC, (n) => fixed(n, 1)) } },
            { id: 'pressure', label: 'Pressure', title: 'The lowest gearbox oil pressure (kg/cm², as filled)', card: { value: oilPressure === null ? 'NA' : fixed(oilPressure, 1), unit: 'kg/cm²', loading, noEntries: !!drives && oilPressure === null, lastEntry: lastFigure(oilPressure, driveLast, (d) => figures(d).oilPressure, (n) => fixed(n, 1)) } },
          ]}
          {...opener}
        />
        <RmsDriveDrawer open={driveOpen} onClose={() => setDriveOpen(false)} report={drives} loading={loading} error={driveS.error} />
        <KpiCard label="Run hours" value={runH == null ? 'NA' : fixed(runH, 1)} unit="h" note="" series="prod" loading={!prodS.data && !prodS.error}
          noEntries={!!prodS.data && prodS.dataUrl === url && runH == null}
          lastEntry={lastFigure(runH, prodLast, (d) => d.totals.runningHrs, (n) => fixed(n, 1))} />
        <PmOnTimeCard pm={pm} onOpen={() => setPmOpen(true)} />
        <ErpPmDrawer open={pmOpen} onClose={() => setPmOpen(false)} pm={pm} runH={runH} title="RMS" />
      </section>

      <div className="rm-row ah-row--one">
        <Panel title="Condition trends" sub="Every machine and every bearing" className="rm-panel" bodyClass="rm-body ah-trends">
          <MidVibrationTrend mid={mid} />
          {/* Every bearing of every drive, each reading; the last entry's when the period has none. */}
          <BearingTrendAll
            points={trend.length || !driveLast.data ? trend : rmsBearingPoints(driveLast.data.entries)}
            last={!trend.length && driveLast.data ? driveLast.date : null}
            empty={drives && !drives.lastDate ? `No entries in the RMS Drive Temp form up to ${dm(drives.to)}` : 'No bearing readings in this period'} />
        </Panel>
      </div>

      <div className="rm-row">
        <Panel title="ERP PM & work-order history" className="rm-panel" bodyClass="rm-body ah-list">
          <ErpPmRows pm={pm} runH={runH} onOpen={() => setPmOpen(true)} />
        </Panel>
        <Panel title="Remarks" sub={remarkSummary(mid) ?? undefined} className="rm-panel" bodyClass="rm-body ah-list ah-list--top">
          <MidRemarks mid={mid} />
        </Panel>
      </div>
    </div>
  );
}

/** Each drive at its latest reading: every bearing, hottest first, and the gearbox oil. */
function RmsDriveDrawer({ open, onClose, report, loading, error }: { open: boolean; onClose: () => void; report: RmsDriveReport | null; loading: boolean; error: string | null }) {
  const latest = report?.latest ?? [];
  const hottest = (e: RmsDriveReading) => (e.bearings.length ? Math.max(...e.bearings.map((b) => b.valueC)) : null);
  return (
    <DrillDrawer open={open} onClose={onClose} title="Drive temperatures" sub="RMS · °C" loading={loading} error={error} hasData={!!report}>
      {report && (
        <>
          <Stats items={[
            { label: 'Drives read', value: String(latest.length), unit: '' },
            { label: 'Readings', value: String(report.entries.length), unit: 'in the period' },
          ]} />
          {latest.length === 0 ? <p className="v-na">No reading in this period</p> : latest.map((e) => (
            <div className="pd-table-wrap" key={e.drive}>
              <table className="grid pd-table" aria-label={`${e.drive} at ${e.at}`}>
                <thead>
                  <tr><th colSpan={2}>{e.drive} · {dm(e.date)} {e.at.slice(11, 16)} · {e.shift}</th><th className="r">°C</th></tr>
                </thead>
                <tbody>
                  {[...e.bearings].sort((a, b) => b.valueC - a.valueC).map((b) => (
                    <tr key={`${b.component} ${b.point}`}>
                      <td><b>{b.component}</b></td><td>{b.point}</td>
                      <td className={`num r ${b.valueC === hottest(e) ? 'v-warn' : 'v-val'}`}>{fixed(b.valueC, 1)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td><b>Gearbox oil</b></td><td>Temperature</td><td className="num r">{e.oilTempC === null ? '—' : fixed(e.oilTempC, 1)}</td></tr>
                  <tr><td /><td>Pressure (kg/cm², as filled)</td><td className="num r">{e.oilPressure === null ? '—' : fixed(e.oilPressure, 1)}</td></tr>
                </tfoot>
              </table>
            </div>
          ))}
          <SourceBox
            sources={[{ name: 'Logbook', rows: [['Form', 'Rolling Mill Structure (RMS) → RMS Mechanical → Drive Temp'], ['Day', 'RMS mill day, 09:30 → 09:30 IST, from the form\'s date-time']] }]}
            formula={['Bearing temp card = the hottest bearing at each drive\'s latest reading', 'Gearbox oil = the hottest oil temperature / the lowest oil pressure at those readings']}
          />
        </>
      )}
    </DrillDrawer>
  );
}
