'use client';

/**
 * RMD Asset Health · Motor current drill-down, for the route / diverter or finishing drive group:
 * each drive now (running or not, its current) and its current over the dashboard's period —
 * the mean of every interval while it runs (its running status 1), a gap while it is stopped —
 * from the plant historian (/api/rmd/current). One chart per drive, grouped by line (the plant,
 * 21 Oct 2026), all on the same amp scale so the drives compare at a glance.
 */
import { useMemo } from 'react';
import './asset.css';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { fmtNum } from '@/components/drill/DrillChart';
import SourceBox, { type SourceSystem } from '@/components/drill/SourceBox';
import { useDrillRange } from '@/components/drill/useDrillRange';
import { rangeUrl, useApi, type RmdCurrentTrend, type RmdLive, type RmdZoneId } from '@/services/hsmApi';

const NAME: Record<RmdZoneId, string> = { route: 'Route', finishing: 'Finishing' };
const LINE_TOKEN: Record<1 | 2, string> = { 1: '--s-prod', 2: '--s-order' };
const a = (v: number | null | undefined) => (v === null || v === undefined ? '—' : fmtNum(v, 0));

export default function RmdCurrentDrawer({ open, onClose, zone }: { open: boolean; onClose: () => void; zone: RmdZoneId }) {
  const r = useDrillRange(['selection'], 'selection', { grain: false });
  const base = open ? rangeUrl('/api/rmd/current', r.dates) : null;
  const url = base ? `${base}&zone=${zone}` : null;
  const trend = useApi<RmdCurrentTrend>(url);
  const live = useApi<RmdLive>(open ? '/api/rmd/live' : null, 30_000);
  return (
    <DrillDrawer open={open} onClose={onClose} title={`${NAME[zone]} · motor current`} sub="RMD · A" controls={r.controls}
      loading={trend.loading} stale={!!trend.data && trend.dataUrl !== url} error={trend.error} hasData={!!trend.data}>
      {trend.data && <Content trend={trend.data} live={live.data} zone={zone} />}
    </DrillDrawer>
  );
}

function Content({ trend, live, zone }: { trend: RmdCurrentTrend; live: RmdLive | null; zone: RmdZoneId }) {
  const now = live?.stations.filter((s) => s.zone === zone) ?? [];
  const running = now.filter((s) => s.on && s.currentA !== null);
  const avgNow = running.length ? running.reduce((t, s) => t + s.currentA!, 0) / running.length : null;
  // One amp scale for every drive of the group, so a higher chart is a higher current.
  const top = useMemo(() => {
    const vals = trend.series.flatMap((s) => s.points.map((p) => p[1])).filter((v): v is number => v !== null);
    return vals.length ? Math.ceil(Math.max(...vals) / 50) * 50 : undefined;
  }, [trend.series]);
  const axes = useMemo(() => [{ title: 'A', unit: 'A', min: 0, max: top }], [top]);
  const meanOf = new Map(trend.series.map((s) => [s.id, s.meanA]));
  const minutes = Math.round(trend.bucketSeconds / 60);
  return (
    <>
      <Stats items={[
        { label: 'Average now', value: a(avgNow), unit: 'A · running drives', tone: avgNow === null ? 'v-na' : undefined },
        { label: 'Running now', value: live ? `${running.length} of ${now.length}` : '—' },
      ]} />
      {([1, 2] as const).map((line) => {
        const drives = trend.series.filter((s) => s.line === line);
        return drives.length === 0 ? null : (
          <section key={line} className="ah-cur-line" aria-label={`Line ${line} motor current`}>
            <h3 className="rm-k">Line {line}</h3>
            <div className="ah-cur-grid">
              {drives.map((s) => (
                <div key={s.id} className="ah-cur-cell">
                  <div className="ah-cur-head">
                    <b>{zone === 'route' ? `Stand ${s.label.replace(/^S/, '')}` : s.label}</b>
                    <span className={`num ${s.meanA === null ? 'v-na' : 'v-val'}`}>{s.meanA === null ? 'Not running' : `avg ${a(s.meanA)} A`}</span>
                  </div>
                  <DrillChart
                    series={[{ id: s.id, name: `L${s.line} ${s.label}`, token: LINE_TOKEN[s.line], type: 'line', data: s.points, dp: 1 }]}
                    axes={axes}
                    height={150}
                    ariaLabel={`Line ${s.line} ${s.label}: motor current while running, ${minutes}-minute intervals, average ${a(s.meanA)} A`}
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Motor current per drive">
          <thead><tr><th>Line</th><th>Drive</th><th>Now</th><th className="r">Current now (A)</th><th className="r">Average while running (A)</th></tr></thead>
          <tbody>
            {now.map((s) => (
              <tr key={s.id}>
                <td>Line {s.line}</td>
                <td><b>{s.label}</b></td>
                <td>
                  <span className={`pd-dot ${s.on === null ? 'pd-dot--na' : s.on ? 'pd-dot--ok' : 'pd-dot--off'}`} aria-hidden />
                  {s.on === null ? 'No live data' : s.on ? 'On' : 'Off'}
                </td>
                <td className={`num r ${s.on && s.currentA !== null ? 'v-val' : 'v-na'}`}>{s.on ? a(s.currentA) : '—'}</td>
                <td className="num r">{a(meanOf.get(s.id))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SourceBox sources={SOURCES[zone]} formula={[
        'Current counts only while the drive runs: its running status is 1 at that instant (both read every 10 s)',
        `Trend = mean current of each ${minutes}-minute interval while running; a gap while stopped`,
        'One chart per drive, by line; every chart on the same amp scale',
        'Average now = mean current of the drives running now',
        'Day = 08:00 IST → 08:00 IST',
      ]} />
      {trend.connection === 'down' && <p className="v-warn">{trend.message}</p>}
    </>
  );
}

const SOURCES: Record<RmdZoneId, SourceSystem[]> = {
  route: [{
    name: 'Influx',
    rows: [
      ['Tag', 'CURRENT_FB_S1 … S8 (line 1), CURRENT_FB_S1 … S6 (line 2); RUNNING_STATUS_S1 … for running'],
      ['Filter', "_measurement = 'TMT-RMD', Unit = 'CR Mill1/2', Group = 'M1' (line 1), 'M2' (line 2)"],
    ],
  }],
  finishing: [
    {
      name: 'Influx · line 1',
      rows: [
        ['Tag', 'CUR_FB_FS, CUR_FB_PR1, CUR_FB_PR2, CUR_FB_TB1, CUR_FB_TB2; RUNNING_STATUS_FS … for running'],
        ['Filter', "_measurement = 'TMT-RMD', Unit = 'Line-1', Group = 'M1'"],
      ],
    },
    {
      name: 'Influx · line 2',
      rows: [
        ['Tag', 'CS_Current, Pinch_Roll_Pre_Current, Pinch_Roll_Post_Current, Tail_Break_01_Current, Tail_Break_02_Current; …_On_Off for running'],
        ['Filter', "_measurement = 'TMT-RMD', Unit = 'Line-2', Group = 'General'"],
      ],
    },
  ],
};
