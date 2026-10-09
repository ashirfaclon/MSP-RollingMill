'use client';

/**
 * An RMD mill-flow zone (route / diverter or finishing), live from the plant historian —
 * opened from the mill flow on the zone clicked: its state, each point's running share over
 * the last hours, each point's status now, and where they come from. Live, so it has a time
 * window of its own rather than the Duration filter (as HSM's stand groups).
 */
import { useState } from 'react';
import DrillDrawer, { Seg, Stats } from '@/components/drill/DrillDrawer';
import StatusTimeline from './StatusTimeline';
import SourceBox, { type SourceSystem } from '@/components/drill/SourceBox';
import { hhmm } from '@/components/drill/CounterDrawer';
import { useApi, type RmdLive, type RmdStationTrend, type RmdZoneId } from '@/services/hsmApi';

const TITLE: Record<RmdZoneId, string> = {
  route: 'Route / diverter · L1 S1–S8, L2 S1–S6',
  finishing: 'Finishing group · line 1 and line 2',
};
const HOURS: { id: '2' | '6' | '24' | '72'; label: string }[] = [
  { id: '2', label: '2 h' }, { id: '6', label: '6 h' }, { id: '24', label: '24 h' }, { id: '72', label: '3 d' },
];

export default function RmdStationsDrawer(props: { open: boolean; onClose: () => void; zone: RmdZoneId }) {
  const [hours, setHours] = useState<'2' | '6' | '24' | '72'>('6');
  const url = props.open ? `/api/rmd/stations?zone=${props.zone}&hours=${hours}` : null;
  const trend = useApi<RmdStationTrend>(url, 60_000);
  const live = useApi<RmdLive>(props.open ? '/api/rmd/live' : null, 30_000);

  return (
    <DrillDrawer
      open={props.open}
      onClose={props.onClose}
      title={TITLE[props.zone]}
      sub="RMD · live"
      controls={<Seg label="Window" value={hours} options={HOURS} onChange={setHours} />}
      loading={trend.loading}
      stale={!!trend.data && trend.dataUrl !== url}
      error={trend.error ?? live.error}
      hasData={!!trend.data}
    >
      {trend.data && <Content trend={trend.data} live={live.data} zone={props.zone} />}
    </DrillDrawer>
  );
}

function Content({ trend, live, zone }: { trend: RmdStationTrend; live: RmdLive | null; zone: RmdZoneId }) {

  const stations = live?.stations.filter((s) => s.zone === zone) ?? [];
  const z = live?.zones.find((x) => x.id === zone);
  const latest = stations.map((s) => s.at).filter((x): x is string => !!x).sort().pop() ?? null;

  return (
    <>
      <Stats items={[
        { label: 'Zone state', value: z?.stateLabel ?? '—', tone: z?.state === 'all-on' ? 'v-ok' : z?.state === 'no-data' ? 'v-na' : 'v-warn' },
        { label: 'Last reading', value: hhmm(latest), tone: stations.some((s) => s.fresh) ? 'v-val' : 'v-warn' },
      ]} />

      <StatusTimeline
        rows={trend.series.map((s) => ({ id: s.id, label: `L${s.line} ${s.label}`, points: s.points }))}
        fromMs={Date.parse(trend.from)}
        toMs={Date.parse(trend.to)}
        ariaLabel={`Running status per point over time, ${trend.bucketSeconds / 60}-minute intervals`}
      />

      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Running status now">
          <thead><tr><th>Line</th><th>Point</th><th>Status</th></tr></thead>
          <tbody>
            {stations.map((s) => (
              <tr key={s.id}>
                <td>Line {s.line}</td>
                <td><b>{s.label}</b></td>
                <td title={s.at ? `Reading at ${hhmm(s.at)}` : undefined}>
                  <span className={`pd-dot ${s.on === null ? 'pd-dot--na' : s.on ? 'pd-dot--ok' : 'pd-dot--off'}`} aria-hidden />
                  {s.on === null ? 'No live data' : s.on ? 'On' : 'Off'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SourceBox sources={SOURCES[zone]} formula={formula(trend.bucketSeconds)} />
      {trend.connection === 'down' && <p className="v-warn">{trend.message}</p>}
    </>
  );
}

const SOURCES: Record<RmdZoneId, SourceSystem[]> = {
  route: [{
    name: 'Influx',
    rows: [
      ['Tag', 'RUNNING_STATUS_S1 … S8 (line 1), RUNNING_STATUS_S1 … S6 (line 2)'],
      ['Filter', "_measurement = 'TMT-RMD', Unit = 'CR Mill1/2', Group = 'M1' (line 1), 'M2' (line 2)"],
    ],
  }],
  finishing: [
    {
      name: 'Influx · line 1',
      rows: [
        ['Tag', 'RUNNING_STATUS_FS, RUNNING_STATUS_PRI, RUNNING_STATUS_PR2, RUNNING_STATUS_TB1, RUNNING_STATUS_TB2'],
        ['Filter', "_measurement = 'TMT-RMD', Unit = 'Line-1', Group = 'M1'"],
      ],
    },
    {
      name: 'Influx · line 2',
      rows: [
        ['Tag', 'CS_On_Off, Pinch_Roll_Pre_On_Off, Pinch_Roll_Post_On_Off, Tail_Breaker_01_On_Off, Tail_Breaker_02_On_Off'],
        ['Filter', "_measurement = 'TMT-RMD', Unit = 'Line-2', Group = 'General'"],
      ],
    },
  ],
};

const formula = (bucketSeconds: number) => [
  'On = latest status 1, read in the last 15 min;  No live data = no reading in 15 min',
  'Zone = all on / x of y on / all off',
  `Trend = % of each ${bucketSeconds / 60}-minute interval with status 1`,
];
