'use client';

/**
 * RMD mill flow, live from the plant historian (refreshed every 30 s) — the same anatomy as
 * HSM's: billet infeed (billets since 08:00 IST, M1 + M2), then each zone's running state
 * with one dot per point; finished exit is the ERP log sheet's production for the period.
 * Roughing group is not sourced yet: NA, and it opens nothing. Each live zone opens the
 * drill-down that shows where its figure comes from.
 */
import { Fragment, useState } from 'react';
import Panel from '@/components/Panel';
import FlowArrow from '@/components/visualization/FlowArrow';
import { hhmm } from '@/components/drill/CounterDrawer';
import { useApi, type RmdLive, type RmdStationNow, type RmdZoneId, type RmdZoneNow } from '@/services/hsmApi';
import RmdYieldDrawer from './RmdYieldDrawer';
import RmdStationsDrawer from './RmdStationsDrawer';
import RmdProductionDrawer, { useRmdProduction } from './RmdProductionDrawer';
import { useSelection } from '@/services/hsmProduction';
import { fixed } from '@/lib/num';

const HM = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
const hm = (iso: string | null) => (iso ? `${HM.format(new Date(iso))} IST` : '—');
const TONE: Record<RmdZoneNow['state'], string> = { 'all-on': 'ok', partial: 'risk', 'all-off': 'na', 'no-data': 'na' };

type Zone =
  | { key: string; kind: 'count'; title: string; value: string; foot: string; open?: () => void; openLabel?: string }
  | { key: string; kind: 'zone'; title: string; z: RmdZoneNow; stations: RmdStationNow[]; open: () => void; openLabel: string };

export default function RmdMillMimic() {
  const live = useApi<RmdLive>('/api/rmd/live', 30_000);
  const [open, setOpen] = useState<'infeed' | 'exit' | RmdZoneId | null>(null);
  const { dates } = useSelection();
  const prod = useRmdProduction(dates).data?.totals.productionMt ?? null;
  const [zone, setZone] = useState<RmdZoneId>('route');
  const d = live.data;
  const loading = !d && !live.error;

  const chip = !d ? <span className="chip chip--na">{live.error ? 'Historian unavailable' : 'Connecting…'}</span>
    : d.fresh ? <span className="chip chip--ok" title={`Last reading ${hhmm(d.lastReadingAt)}`}>Live · {hm(d.lastReadingAt)}</span>
    : <span className="chip chip--warn" title={d.message}>No recent readings · last {hhmm(d.lastReadingAt)}</span>;

  const zoneOf = (id: RmdZoneId): Zone | null => {
    const z = d?.zones.find((x) => x.id === id);
    return z ? {
      key: id, kind: 'zone', title: z.label, z, stations: d!.stations.filter((s) => s.zone === id),
      open: () => { setZone(id); setOpen(id); }, openLabel: `${z.label}: running status per point, and trend`,
    } : null;
  };
  const zones: Zone[] = [
    {
      key: 'infeed', kind: 'count', title: 'Billet infeed',
      value: d?.billetsToday === null || d?.billetsToday === undefined ? 'NA' : `${d.billetsToday} billets`,
      foot: 'Today · since 08:00 IST', open: () => setOpen('infeed'), openLabel: 'Billets in per day, line 1 and line 2',
    },
    { key: 'roughing', kind: 'count', title: 'Roughing group', value: 'NA', foot: '' },
    ...[zoneOf('route'), zoneOf('finishing')].filter((z): z is Zone => z !== null),
    {
      key: 'exit', kind: 'count', title: 'Finished exit', value: prod === null ? 'NA' : `${fixed(prod, 1)} MT`,
      foot: '', open: () => setOpen('exit'), openLabel: 'Production per day, from the ERP log sheet',
    },
  ];

  return (
    <Panel title="Mill mimic" right={chip}>
      {loading ? (
        <span className="skel skel--block" style={{ height: 78 }} role="status" aria-label="Loading" />
      ) : (
        <ol className="rm-mimic rmd-mimic" aria-label="Mill process flow">
          {zones.map((z, i) => (
            <Fragment key={z.key}>
              {i > 0 && <li className="rm-mimic-arrow" aria-hidden><FlowArrow /></li>}
              <li className="rm-mimic-cell">
                <ZoneCell z={z} />
              </li>
            </Fragment>
          ))}
        </ol>
      )}
      <RmdYieldDrawer view="infeed" open={open === 'infeed'} onClose={() => setOpen(null)} />
      <RmdStationsDrawer zone={zone} open={open === 'route' || open === 'finishing'} onClose={() => setOpen(null)} />
      <RmdProductionDrawer view="production" open={open === 'exit'} onClose={() => setOpen(null)} />
    </Panel>
  );
}

/** One zone: a button when it has a drill-down, a plain tile when it has nothing behind it. */
function ZoneCell({ z }: { z: Zone }) {
  const tone = z.kind === 'zone' ? `rm-zone--${TONE[z.z.state]}` : 'rm-zone--flow';
  const body = (
    <>
      <span className="rm-zone-title">{z.title}</span>
      <span className="rm-zone-body">
        {z.kind === 'zone' ? (
          <>
            <span className="rm-zone-value rm-zone-state v-val">{z.z.stateLabel}</span>
            <PointDots stations={z.stations} />
          </>
        ) : (
          <span className={`rm-zone-value num ${z.value === 'NA' ? 'v-na' : 'v-val'}`}>{z.value}</span>
        )}
      </span>
      {/* Always present (empty for most) so the zones line up. */}
      <span className="rm-zone-foot">{(z.kind === 'count' && z.foot) || ' '}</span>
    </>
  );
  if (!z.open) return <div className={`rm-zone ${tone}`}>{body}</div>;
  return (
    <button type="button" className={`rm-zone rm-zone--button ${tone}`} onClick={z.open} aria-haspopup="dialog" title={z.openLabel}>
      {body}
    </button>
  );
}

/** One dot per point — on, off, or no fresh reading — line 1 then line 2, a gap between. */
function PointDots({ stations }: { stations: RmdStationNow[] }) {
  const lines = [1, 2].map((l) => stations.filter((s) => s.line === l)).filter((g) => g.length);
  const say = (s: RmdStationNow) => `L${s.line} ${s.label} ${s.on === null ? 'no data' : s.on ? 'on' : 'off'}`;
  return (
    <span className="rmd-dot-lines" aria-label={stations.map(say).join(', ')}>
      {lines.map((g) => (
        <span key={g[0].line} className="rm-dots">
          {g.map((s) => (
            <i key={s.id} className={`rm-dot ${s.on === null ? 'rm-dot--na' : s.on ? 'rm-dot--on' : 'rm-dot--off'}`}
              title={`Line ${s.line} · ${s.label} · ${s.on === null ? 'no live data' : s.on ? 'on' : 'off'}`} />
          ))}
        </span>
      ))}
    </span>
  );
}
