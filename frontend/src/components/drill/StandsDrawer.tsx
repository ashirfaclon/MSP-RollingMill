'use client';

/**
 * Mill stands, live from the plant historian: each stand's latest drive readings, and a
 * trend of one reading per stand over the last hours, with the roughing mill speed on the
 * same time base. The stand group is chosen here; the mimic opens it on the group clicked.
 */
import { useMemo, useState } from 'react';
import DrillDrawer, { Seg, Stats } from './DrillDrawer';
import DrillChart, { fmtNum, type DrillAxis, type DrillSeries } from './DrillChart';
import { hhmm } from './CounterDrawer';
import { useApi, type HsmLive, type StandMetric, type StandTrend } from '@/services/hsmApi';

type Group = 'roughing' | 'finishing';

const GROUPS: { id: Group; label: string }[] = [
  { id: 'roughing', label: 'Roughing RM 1–5' },
  { id: 'finishing', label: 'Finishing FM 1–6' },
];
const METRICS: { id: StandMetric; label: string }[] = [
  { id: 'current', label: 'Motor current' },
  { id: 'rpm', label: 'Motor RPM' },
  { id: 'force', label: 'Roll force' },
  { id: 'onOff', label: 'Drive on' },
];
const HOURS: { id: '2' | '6' | '24' | '72'; label: string }[] = [
  { id: '2', label: '2 h' }, { id: '6', label: '6 h' }, { id: '24', label: '24 h' }, { id: '72', label: '3 d' },
];
const UNIT: Record<StandMetric, string> = { current: 'A', rpm: 'rpm', force: 't', onOff: '%' };
const TOKENS = ['--s-prod', '--s-order', '--s-free', '--s-pred', '--s-alt', '--risk'];

export default function StandsDrawer(props: { open: boolean; onClose: () => void; group: Group; onGroup: (g: Group) => void }) {
  const [metric, setMetric] = useState<StandMetric>('current');
  const [hours, setHours] = useState<'2' | '6' | '24' | '72'>('6');
  const url = props.open ? `/api/hsm/stands?group=${props.group}&metric=${metric}&hours=${hours}` : null;
  const trend = useApi<StandTrend>(url, 60_000);
  const live = useApi<HsmLive>(props.open ? '/api/hsm/live' : null, 30_000);

  return (
    <DrillDrawer
      open={props.open}
      onClose={props.onClose}
      title="Mill stands · live"
      sub="HSM · Hot Strip Mill · plant historian (Influx)"
      controls={<>
        <Seg label="Stand group" value={props.group} options={GROUPS} onChange={props.onGroup} />
        <Seg label="Reading" value={metric} options={METRICS} onChange={setMetric} />
        <Seg label="Window" value={hours} options={HOURS} onChange={setHours} />
      </>}
      loading={trend.loading}
      stale={!!trend.data && trend.dataUrl !== url}
      error={trend.error ?? live.error}
      hasData={!!trend.data}
    >
      {trend.data && <Content trend={trend.data} live={live.data} group={props.group} />}
    </DrillDrawer>
  );
}

function Content({ trend, live, group }: { trend: StandTrend; live: HsmLive | null; group: Group }) {
  const unit = UNIT[trend.metric];
  const series = useMemo<DrillSeries[]>(() => [
    ...trend.series.map((s, i) => ({
      id: s.id, name: `${s.id.replace('_', ' ')} · ${s.field}`, token: TOKENS[i % TOKENS.length],
      type: 'line' as const, data: s.points, dp: trend.metric === 'onOff' ? 0 : 1,
    })),
    { id: 'speed', name: 'Rolling_Mill_Speed', token: '--text', type: 'line' as const, dashed: true, axis: 1, data: trend.speed, dp: 2 },
  ], [trend]);
  const axes = useMemo<DrillAxis[]>(() => [
    { title: `${METRICS.find((m) => m.id === trend.metric)?.label} (${unit})`, unit, min: 0, max: trend.metric === 'onOff' ? 100 : undefined },
    { title: 'Mill speed', unit: '', opposite: true, min: 0 },
  ], [trend.metric, unit]);

  const stands = live?.stands.filter((s) => s.group === group) ?? [];
  const g = live?.groups.find((x) => x.id === group);

  return (
    <>
      <Stats items={[
        { label: 'Group state', value: g?.stateLabel ?? '—', tone: g?.state === 'all-on' ? 'v-ok' : g?.state === 'no-data' ? 'v-na' : 'v-warn' },
        { label: 'Mill speed', value: fmtNum(live?.millSpeed, 2), title: 'Roughing Mill · General · Rolling_Mill_Speed — idle ≈ 0.1, rolling 0.8–1.0' },
        { label: 'Billets today', value: live?.billetsToday === null || live?.billetsToday === undefined ? '—' : String(live.billetsToday), unit: 'since 06:00' },
        { label: 'Last reading', value: hhmm(live?.lastReadingAt ?? null), tone: live?.fresh ? 'v-val' : 'v-warn' },
      ]} />

      <DrillChart
        series={series}
        axes={axes}
        ariaLabel={`${trend.metric} per stand over the last hours, ${trend.bucketSeconds / 60}-minute means`}
      />

      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Stand readings now">
          <thead><tr><th>Stand</th><th>Drive</th><th className="r">Current (A)</th><th className="r">Motor RPM</th><th className="r">Roll force (t)</th><th>Reading at</th></tr></thead>
          <tbody>
            {stands.map((s) => (
              <tr key={s.id}>
                <td><b>{s.id.replace('_', ' ')}</b></td>
                <td>
                  <span className={`pd-dot ${s.on === null ? 'pd-dot--na' : s.on ? 'pd-dot--ok' : 'pd-dot--off'}`} aria-hidden />
                  {s.on === null ? 'No live data' : s.on ? 'On' : 'Off'}
                </td>
                <td className="num r v-val">{fmtNum(s.currentA, 1)}</td>
                <td className="num r v-val">{fmtNum(s.rpm, 1)}</td>
                <td className="num r v-val">{fmtNum(s.forceT, 1)}</td>
                <td className={s.fresh ? undefined : 'v-warn'}>{hhmm(s.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="pd-notes">
        <li><b>Source</b> — plant historian, measurement HSM, Unit {group === 'roughing' ? 'Roughing Mill' : 'Finishing Mill'}, one Group per stand; fields On_Off<i>n</i>, Motor_Current<i>n</i>, Motor_RPM<i>n</i>, Roll_Force_Ton<i>n</i> (FM 01 and RM 05 publish current as Motor_Curren<i>n</i>).</li>
        <li><b>Trend</b> — {trend.bucketSeconds / 60}-minute means{trend.metric === 'onOff' ? '; “Drive on” is the share of each interval the stand reported On' : ''}. Drag across the chart to zoom. A gap is a stretch with no reading, not a zero.</li>
        <li><b>Drive on</b> means the stand&apos;s drive reports On — not that strip is passing through it. A stand whose last reading is over 15 minutes old shows &quot;No live data&quot; rather than its last state.</li>
        {trend.connection === 'down' && <li className="v-warn">{trend.message}</li>}
      </ul>
    </>
  );
}
