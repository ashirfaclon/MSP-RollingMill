'use client';

/**
 * RMD Asset Health · Motor current drill-down, for the route / diverter or finishing drive group:
 * each drive now (running or not, its current) and its current over the dashboard's period —
 * the mean of every interval while it runs (its running status 1), a gap while it is stopped —
 * from the plant historian (/api/rmd/current).
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox, { type SourceSystem } from '@/components/drill/SourceBox';
import { useDrillRange } from '@/components/drill/useDrillRange';
import { rangeUrl, useApi, type RmdCurrentTrend, type RmdLive, type RmdZoneId } from '@/services/hsmApi';

const NAME: Record<RmdZoneId, string> = { route: 'Route', finishing: 'Finishing' };
/** Line 1 solid, line 2 dashed; colours cycle within a line. */
const TOKENS = ['--s-prod', '--s-order', '--s-alt', '--s-free', '--violet', '--s-pred', '--gold', '--s-actual'];
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
  const series = useMemo<DrillSeries[]>(() => trend.series.map((s, i) => ({
    id: s.id, name: `L${s.line} ${s.label}`, token: TOKENS[i % TOKENS.length], type: 'line', dashed: s.line === 2,
    data: s.points, dp: 1,
  })), [trend.series]);
  const axes = useMemo(() => [{ title: 'A', unit: 'A', min: 0 }], []);
  const meanOf = new Map(trend.series.map((s) => [s.id, s.meanA]));
  return (
    <>
      <Stats items={[
        { label: 'Average now', value: a(avgNow), unit: 'A · running drives', tone: avgNow === null ? 'v-na' : undefined },
        { label: 'Running now', value: live ? `${running.length} of ${now.length}` : '—' },
      ]} />
      <DrillChart series={series} axes={axes} height={300}
        ariaLabel={`Motor current per drive while running, ${Math.round(trend.bucketSeconds / 60)}-minute intervals: ${trend.series.map((s) => `L${s.line} ${s.label} average ${a(s.meanA)} A`).join('; ')}`} />
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
        `Trend = mean current of each ${Math.round(trend.bucketSeconds / 60)}-minute interval while running; a gap while stopped`,
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
