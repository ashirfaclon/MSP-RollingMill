'use client';

/**
 * Billet infeed to finished exit, live, drawn as the HSM process twin (components/twin): the
 * roller table, RM 1–5, FM 1–6 and the coil, with the hot steel moving along the active path at
 * the stands' own speeds. The historian is polled at its own cadence by the live store
 * (liveStore.ts: 10 s, paused when hidden, backed off on failure); the exit is the Influx
 * production counter (Total_Production_Ton) for the Duration period — the same figure as the
 * Production card. Each machine opens the drill-down that shows where its figure comes from.
 *
 * The historian has no intermediate stand group — only Roughing RM 1–5 and Finishing
 * FM 1–6 — so the twin shows the groups that exist.
 */
import { useCallback, useMemo, useState } from 'react';
import Panel from '@/components/Panel';
import ProcessTwin, { type TwinTarget } from '@/components/twin/ProcessTwin';
import LivePill from '@/components/twin/LivePill';
import { useLive } from '@/components/twin/liveStore';
import { hsmLiveEdges, hsmTwinModel } from '@/components/twin/twinModel';
import CounterDrawer, { BILLET_COUNTER } from '@/components/drill/CounterDrawer';
import StandsDrawer from '@/components/drill/StandsDrawer';
import ProductionDrawer from '@/components/production/ProductionDrawer';
import type { GroupNow, HsmLive } from '@/services/hsmApi';
import { useProduction, useSelection } from '@/services/hsmProduction';

export const TONE: Record<GroupNow['state'], string> = { 'all-on': 'ok', partial: 'risk', 'all-off': 'na', 'no-data': 'na' };

export default function MillMimic() {
  const live = useLive<HsmLive>('/api/hsm/live', hsmLiveEdges);
  const { dates } = useSelection();
  const prod = useProduction(dates ? { ...dates, grain: 'day' } : null);
  const [open, setOpen] = useState<'billets' | 'stands' | 'production' | null>(null);
  const [group, setGroup] = useState<'roughing' | 'finishing'>('roughing');
  const [selected, setSelected] = useState<string | null>(null);

  const d = live.data;
  const prodNow = prod.data && dates && prod.data.from === dates.from && prod.data.to === dates.to ? prod.data : null;
  const exit = prodNow?.totals.influxMt ?? null;
  const loading = !d && live.status === 'connecting';
  const model = useMemo(() => hsmTwinModel(d, exit, live.now), [d, exit, live.now]);
  const onSelect = useCallback((id: string | null) => setSelected(id), []);
  const openTarget = (t: TwinTarget) => {
    if (t.kind === 'infeed') setOpen('billets');
    else if (t.kind === 'exit') setOpen('production');
    else { setGroup(t.node.section as 'roughing' | 'finishing'); setOpen('stands'); }
  };

  return (
    <Panel title="Mill mimic" sub={d ? `${model.totals.on} of ${model.totals.total} stands on` : undefined}
      right={<LivePill snap={live} model={model} lastReadingAt={d?.lastReadingAt} />}>
      {loading ? (
        <span className="skel skel--block" style={{ height: 150 }} role="status" aria-label="Loading" />
      ) : (
        <ProcessTwin model={model} onOpen={openTarget} selected={selected} onSelect={onSelect} />
      )}
      <CounterDrawer open={open === 'billets'} onClose={() => setOpen(null)} config={BILLET_COUNTER} />
      <StandsDrawer open={open === 'stands'} onClose={() => setOpen(null)} group={group} />
      <ProductionDrawer open={open === 'production'} onClose={() => setOpen(null)} />
    </Panel>
  );
}

/** One dot per stand: on, off, or no fresh reading (the Asset Health / CA zone tiles). */
export function StandDots({ stands }: { stands: HsmLive['stands'] }) {
  return (
    <span className="rm-dots" aria-label={stands.map((s) => `${s.id} ${s.on === null ? 'no data' : s.on ? 'on' : 'off'}`).join(', ')}>
      {stands.map((s) => (
        <i key={s.id} className={`rm-dot ${s.on === null ? 'rm-dot--na' : s.on ? 'rm-dot--on' : 'rm-dot--off'}`} title={`${s.id.replace('_', ' ')} · ${s.on === null ? 'no live data' : s.on ? 'on' : 'off'}`} />
      ))}
    </span>
  );
}
