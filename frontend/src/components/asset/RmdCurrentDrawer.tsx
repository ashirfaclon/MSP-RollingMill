'use client';

/**
 * RMD Asset Health · Motor current drill-down, for the route / diverter or finishing drive group:
 * each drive now (running or not, its current) and its current over the dashboard's period —
 * the mean of every interval while it runs (its running status 1), a gap while it is stopped —
 * from the plant historian (/api/rmd/current). Each drive has its own chart (the plant, 21 Oct
 * 2026), shown one at a time: pick the line, then the drive from a strip with every drive's
 * average and its state now; every drive on the same amp scale.
 */
import { useMemo, useState } from 'react';
import './asset.css';
import DrillDrawer, { Seg, Stats } from '@/components/drill/DrillDrawer';
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
  const nowOf = new Map(now.map((s) => [s.id, s]));
  const running = now.filter((s) => s.on && s.currentA !== null);
  const avgNow = running.length ? running.reduce((t, s) => t + s.currentA!, 0) / running.length : null;
  const lines = ([1, 2] as const).filter((l) => trend.series.some((s) => s.line === l));
  const [line, setLine] = useState<1 | 2>(lines[0] ?? 1);
  const drives = trend.series.filter((s) => s.line === line);
  // The picked drive, else the first that ran, else the first.
  const [pick, setPick] = useState<string | null>(null);
  const sel = drives.find((s) => s.id === pick) ?? drives.find((s) => s.meanA !== null) ?? drives[0] ?? null;
  // One amp scale for every drive of the group, so switching drives keeps the scale.
  const top = useMemo(() => {
    const vals = trend.series.flatMap((s) => s.points.map((p) => p[1])).filter((v): v is number => v !== null);
    return vals.length ? Math.ceil(Math.max(...vals) / 50) * 50 : undefined;
  }, [trend.series]);
  const axes = useMemo(() => [{ title: 'A', unit: 'A', min: 0, max: top }], [top]);
  const minutes = Math.round(trend.bucketSeconds / 60);
  const name = (label: string) => (zone === 'route' ? `Stand ${label.replace(/^S/, '')}` : label);
  return (
    <>
      <Stats items={[
        { label: 'Average now', value: a(avgNow), unit: 'A · running drives', tone: avgNow === null ? 'v-na' : undefined },
        { label: 'Running now', value: live ? `${running.length} of ${now.length}` : '—' },
      ]} />
      {lines.length > 1 && (
        <Seg label="Line" value={String(line) as '1' | '2'} options={lines.map((l) => ({ id: String(l) as '1' | '2', label: `Line ${l}` }))}
          onChange={(v) => { setLine(Number(v) as 1 | 2); setPick(null); }} />
      )}
      <div className="ah-cur-pick" role="group" aria-label={`Line ${line} drives`}>
        {drives.map((s) => {
          const n = nowOf.get(s.id);
          return (
            <button key={s.id} type="button" className={`ah-cur-chip${sel?.id === s.id ? ' on' : ''}`} aria-pressed={sel?.id === s.id} onClick={() => setPick(s.id)}>
              <span className="ah-cur-chip-name">
                <span className={`pd-dot ${!n || n.on === null ? 'pd-dot--na' : n.on ? 'pd-dot--ok' : 'pd-dot--off'}`} aria-hidden />
                {s.label}
              </span>
              <span className={`ah-cur-chip-v num ${s.meanA === null ? 'v-na' : 'v-val'}`}>{s.meanA === null ? '—' : `${a(s.meanA)} A`}</span>
              <span className="ah-cur-chip-now">{!n || n.on === null ? 'no live data' : n.on ? `now ${a(n.currentA)} A` : 'off now'}</span>
            </button>
          );
        })}
      </div>
      {sel && (
        <section className="ah-cur-one" aria-label={`${name(sel.label)} motor current`}>
          <div className="ah-cur-head">
            <b>Line {sel.line} · {name(sel.label)}</b>
            <span className={`num ${sel.meanA === null ? 'v-na' : 'v-val'}`}>{sel.meanA === null ? 'Did not run in the period' : `average ${a(sel.meanA)} A while running`}</span>
          </div>
          <DrillChart
            series={[{ id: sel.id, name: `L${sel.line} ${sel.label}`, token: LINE_TOKEN[sel.line], type: 'line', data: sel.points, dp: 1 }]}
            axes={axes}
            height={280}
            ariaLabel={`Line ${sel.line} ${sel.label}: motor current while running, ${minutes}-minute intervals, average ${a(sel.meanA)} A`}
          />
        </section>
      )}
      <SourceBox sources={SOURCES[zone]} formula={[
        'Current counts only while the drive runs: status and current are averaged per minute, and a minute counts when the drive ran all of it',
        `Trend = mean current of each ${minutes}-minute interval while running; a gap while stopped`,
        'Pick a line, then a drive; every drive on the same amp scale',
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
