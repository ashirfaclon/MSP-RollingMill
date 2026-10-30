'use client';

/**
 * RMD mill flow, live, drawn as the RMD process twin (components/twin): one billet infeed
 * (billets since 09:00 IST, M1 + M2), then the two lines — each its 10" stands and then its
 * finishing machines, in the order the dashboard lists them — leaving as bar; the exit is the
 * ERP log sheet's production for the period. Each line's runs move at that line's mill speed
 * (MILL1_MPS / MILL2_MPS). The historian is polled at its own cadence by the live store
 * (liveStore.ts). No roughing group (removed by the user, 22 Oct 2026). Each machine opens
 * the drill-down that shows where its figure comes from.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import Panel from '@/components/Panel';
import ProcessTwin, { type TwinTarget } from '@/components/twin/ProcessTwin';
import LivePill from '@/components/twin/LivePill';
import { useLive } from '@/components/twin/liveStore';
import { rmdLiveEdges, rmdSpeedEdges, rmdTwinModel } from '@/components/twin/twinModel';
import { rangeUrl, type RmdLive, type RmdMillSpeedReport, type RmdZoneId } from '@/services/hsmApi';
import RmdBilletsDrawer from './RmdBilletsDrawer';
import RmdStationsDrawer from './RmdStationsDrawer';
import RmdProductionDrawer, { useRmdProduction } from './RmdProductionDrawer';
import { useSelection } from '@/services/hsmProduction';

/** `children`: rows a screen adds under the drawing (Condition Analytics' notes). */
export default function RmdMillMimic({ children }: { children?: ReactNode }) {
  const live = useLive<RmdLive>('/api/rmd/live', rmdLiveEdges);
  const [open, setOpen] = useState<'infeed' | 'exit' | RmdZoneId | null>(null);
  const { dates } = useSelection();
  const prod = useRmdProduction(dates).data?.totals.productionMt ?? null;
  /* Each line's mill speed now: the last reading of the period. A period query, so every 30 s is enough. */
  const speed = useLive<RmdMillSpeedReport>(rangeUrl('/api/rmd/mill-speed', dates), rmdSpeedEdges, 30_000);
  const [zone, setZone] = useState<RmdZoneId>('route');
  const [selected, setSelected] = useState<string | null>(null);
  const d = live.data;
  const loading = !d && live.status === 'connecting';
  const model = useMemo(() => rmdTwinModel(d, speed.data?.latest ?? null, prod, live.now), [d, speed.data, prod, live.now]);
  const onSelect = useCallback((id: string | null) => setSelected(id), []);
  const openTarget = (t: TwinTarget) => {
    if (t.kind === 'node') { setZone(t.node.section as RmdZoneId); setOpen(t.node.section as RmdZoneId); } else setOpen(t.kind);
  };

  return (
    <Panel title="Mill mimic" sub={d ? `${model.totals.on} of ${model.totals.total} machines on` : undefined}
      right={<LivePill snap={live} model={model} lastReadingAt={d?.lastReadingAt} />}>
      {loading ? (
        <span className="skel skel--block" style={{ height: 270 }} role="status" aria-label="Loading" />
      ) : (
        <ProcessTwin model={model} onOpen={openTarget} selected={selected} onSelect={onSelect} />
      )}
      {children}
      <RmdBilletsDrawer open={open === 'infeed'} onClose={() => setOpen(null)} />
      <RmdStationsDrawer zone={zone} open={open === 'route' || open === 'finishing'} onClose={() => setOpen(null)} />
      <RmdProductionDrawer view="production" open={open === 'exit'} onClose={() => setOpen(null)} />
    </Panel>
  );
}
