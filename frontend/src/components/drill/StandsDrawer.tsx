'use client';

/**
 * A stand group, live from the plant historian — opened from the mill flow on the group
 * clicked (roughing or finishing): the group's state, a trend of one reading per stand
 * over the last hours, each stand's latest readings, and where they come from. Live, so
 * it has a time window of its own rather than the Duration filter.
 */
import { useMemo, useState } from 'react';
import DrillDrawer, { Seg, Stats } from './DrillDrawer';
import DrillChart, { fmtNum, type DrillAxis, type DrillSeries } from './DrillChart';
import SourceBox, { type SourceSystem } from './SourceBox';
import { hhmm } from './CounterDrawer';
import { useApi, type HsmLive, type StandMetric, type StandTrend } from '@/services/hsmApi';

type Group = 'roughing' | 'finishing';

const TITLE: Record<Group, string> = { roughing: 'Roughing group · RM 1–5', finishing: 'Finishing group · FM 1–6' };
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
/** "RM_01" → "RM 1". */
const standName = (id: string) => id.replace(/_0?/, ' ');

export default function StandsDrawer(props: { open: boolean; onClose: () => void; group: Group }) {
  const [metric, setMetric] = useState<StandMetric>('current');
  const [hours, setHours] = useState<'2' | '6' | '24' | '72'>('6');
  const url = props.open ? `/api/hsm/stands?group=${props.group}&metric=${metric}&hours=${hours}` : null;
  const trend = useApi<StandTrend>(url, 60_000);
  const live = useApi<HsmLive>(props.open ? '/api/hsm/live' : null, 30_000);

  return (
    <DrillDrawer
      open={props.open}
      onClose={props.onClose}
      title={TITLE[props.group]}
      sub="HSM · live"
      controls={<>
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
  const series = useMemo<DrillSeries[]>(() => trend.series.map((s, i) => ({
    id: s.id, name: standName(s.id), token: TOKENS[i % TOKENS.length],
    type: 'line' as const, data: s.points, dp: trend.metric === 'onOff' ? 0 : 1,
  })), [trend]);
  const axes = useMemo<DrillAxis[]>(() => [
    { title: `${METRICS.find((m) => m.id === trend.metric)?.label} (${unit})`, unit, min: 0, max: trend.metric === 'onOff' ? 100 : undefined },
  ], [trend.metric, unit]);

  const stands = live?.stands.filter((s) => s.group === group) ?? [];
  const g = live?.groups.find((x) => x.id === group);
  const latest = stands.map((s) => s.at).filter((x): x is string => !!x).sort().pop() ?? null;

  return (
    <>
      <Stats items={[
        { label: 'Group state', value: g?.stateLabel ?? '—', tone: g?.state === 'all-on' ? 'v-ok' : g?.state === 'no-data' ? 'v-na' : 'v-warn' },
        { label: 'Last reading', value: hhmm(latest), tone: stands.some((s) => s.fresh) ? 'v-val' : 'v-warn' },
      ]} />

      <DrillChart
        series={series}
        axes={axes}
        ariaLabel={`${METRICS.find((m) => m.id === trend.metric)?.label} per stand, ${trend.bucketSeconds / 60}-minute means`}
      />

      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Stand readings now">
          <thead><tr><th>Stand</th><th>Drive</th><th className="r">Current (A)</th><th className="r">Motor RPM</th><th className="r">Roll force (t)</th></tr></thead>
          <tbody>
            {stands.map((s) => (
              <tr key={s.id}>
                <td><b>{standName(s.id)}</b></td>
                <td title={s.at ? `Reading at ${hhmm(s.at)}` : undefined}>
                  <span className={`pd-dot ${s.on === null ? 'pd-dot--na' : s.on ? 'pd-dot--ok' : 'pd-dot--off'}`} aria-hidden />
                  {s.on === null ? 'No live data' : s.on ? 'On' : 'Off'}
                </td>
                <td className="num r v-val">{fmtNum(s.currentA, 1)}</td>
                <td className="num r v-val">{fmtNum(s.rpm, 1)}</td>
                <td className="num r v-val">{fmtNum(s.forceT, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SourceBox sources={sources(group)} formula={formula(trend.bucketSeconds)} />
      {trend.connection === 'down' && <p className="v-warn">{trend.message}</p>}
    </>
  );
}

const sources = (group: Group): SourceSystem[] => [
  {
    name: 'Influx',
    rows: [
      ['Tag', 'On_Off<n>, Motor_Current<n>, Motor_RPM<n>, Roll_Force_Ton<n>  (n = stand number)'],
      ['Filter', group === 'roughing'
        ? "_measurement = 'HSM', Unit = 'Roughing Mill', Group = 'RM_01' … 'RM_05'"
        : "_measurement = 'HSM', Unit = 'Finishing Mill', Group = 'FM_01' … 'FM_06'"],
      ['Note', group === 'roughing' ? 'RM 5 publishes current as Motor_Curren5' : 'FM 1 publishes current as Motor_Curren1'],
    ],
  },
];

const formula = (bucketSeconds: number) => [
  `Trend = ${bucketSeconds / 60}-minute mean of each reading`,
  'Drive on = share of the interval the stand reported On_Off = 1',
  'No live data = last reading more than 15 min old',
];
