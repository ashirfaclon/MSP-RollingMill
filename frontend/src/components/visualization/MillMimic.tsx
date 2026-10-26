'use client';

/**
 * Billet infeed to finished exit, live. Infeed and the two stand groups come from the
 * plant historian (refreshed every 30 s); the exit is the Influx production counter
 * (Total_Production_Ton) for the Duration period — the same figure as the Production card. Each zone opens the drill-down that shows where its figure comes from.
 *
 * The historian has no intermediate stand group — only Roughing RM 1–5 and Finishing
 * FM 1–6 — so the mimic shows the groups that exist.
 */
import { Fragment, useState } from 'react';
import Panel from '@/components/Panel';
import { fixed } from '@/lib/num';
import FlowArrow from './FlowArrow';
import CounterDrawer, { BILLET_COUNTER, hhmm } from '@/components/drill/CounterDrawer';
import StandsDrawer from '@/components/drill/StandsDrawer';
import ProductionDrawer from '@/components/production/ProductionDrawer';
import { useApi, type GroupNow, type HsmLive } from '@/services/hsmApi';
import { useProduction, useSelection } from '@/services/hsmProduction';

const HM = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
const hm = (iso: string | null) => (iso ? `${HM.format(new Date(iso))} IST` : '—');

export const TONE: Record<GroupNow['state'], string> = { 'all-on': 'ok', partial: 'risk', 'all-off': 'na', 'no-data': 'na' };

export default function MillMimic() {
  const live = useApi<HsmLive>('/api/hsm/live', 30_000);
  const { dates } = useSelection();
  const prod = useProduction(dates ? { ...dates, grain: 'day' } : null);
  const [open, setOpen] = useState<'billets' | 'stands' | 'production' | null>(null);
  const [group, setGroup] = useState<'roughing' | 'finishing'>('roughing');

  const d = live.data;
  const prodNow = prod.data && dates && prod.data.from === dates.from && prod.data.to === dates.to ? prod.data : null;
  const exit = prodNow?.totals.influxMt ?? null;
  const loading = !d && !live.error;

  const chip = !d ? <span className="chip chip--na">{live.error ? 'Historian unavailable' : 'Connecting…'}</span>
    : d.fresh ? <span className="chip chip--ok" title={`Last reading ${hhmm(d.lastReadingAt)}`}>Live · {hm(d.lastReadingAt)}</span>
    : <span className="chip chip--warn" title={d.message}>No recent readings · last {hhmm(d.lastReadingAt)}</span>;

  const zones = [
    {
      key: 'infeed', kind: 'count' as const, title: 'Billet infeed',
      value: d?.billetsToday === null || d?.billetsToday === undefined ? 'NA' : `${d.billetsToday} billets`,
      foot: 'Today · since 06:00 IST', open: () => setOpen('billets'), openLabel: 'Billets per day, ERP vs mill counter',
    },
    ...(d?.groups ?? []).map((g) => ({
      key: g.id, kind: 'group' as const, title: g.label, g,
      foot: '',
      open: () => { setGroup(g.id); setOpen('stands'); }, openLabel: `${g.label} stand readings and trend`,
    })),
    {
      key: 'exit', kind: 'count' as const, title: 'Finished exit',
      value: exit === null ? 'NA' : `${fixed(exit, 1)} MT`,
      foot: '', open: () => setOpen('production'), openLabel: 'Mill counter vs ERP production',
    },
  ];

  return (
    <Panel title="Mill mimic" right={chip}>
      {loading ? (
        <span className="skel skel--block" style={{ height: 78 }} role="status" aria-label="Loading" />
      ) : (
        <ol className="rm-mimic" aria-label="Mill process flow">
          {zones.map((z, i) => (
            <Fragment key={z.key}>
              {i > 0 && <li className="rm-mimic-arrow" aria-hidden><FlowArrow /></li>}
              <li className="rm-mimic-cell">
                <button
                  type="button"
                  className={`rm-zone rm-zone--button ${z.kind === 'group' ? `rm-zone--${TONE[z.g.state]}` : 'rm-zone--flow'}`}
                  onClick={z.open}
                  aria-haspopup="dialog"
                  title={z.openLabel}
                >
                  <span className="rm-zone-title">{z.title}</span>
                  <span className="rm-zone-body">
                    {z.kind === 'group' ? (
                      <>
                        <span className="rm-zone-value rm-zone-state v-val">{z.g.stateLabel}</span>
                        <StandDots stands={d!.stands.filter((s) => s.group === z.g.id)} />
                      </>
                    ) : (
                      <span className="rm-zone-value num v-val">{z.value}</span>
                    )}
                  </span>
                  {/* Always present (empty for most) so the zones line up. Infeed keeps "since 06:00": it is today-only, whatever the Duration. */}
                  <span className="rm-zone-foot">{z.foot || '\u00a0'}</span>
                </button>
              </li>
            </Fragment>
          ))}
        </ol>
      )}
      <CounterDrawer open={open === 'billets'} onClose={() => setOpen(null)} config={BILLET_COUNTER} />
      <StandsDrawer open={open === 'stands'} onClose={() => setOpen(null)} group={group} />
      <ProductionDrawer open={open === 'production'} onClose={() => setOpen(null)} />
    </Panel>
  );
}

/** One dot per stand: on, off, or no fresh reading. */
export function StandDots({ stands }: { stands: HsmLive['stands'] }) {
  return (
    <span className="rm-dots" aria-label={stands.map((s) => `${s.id} ${s.on === null ? 'no data' : s.on ? 'on' : 'off'}`).join(', ')}>
      {stands.map((s) => (
        <i key={s.id} className={`rm-dot ${s.on === null ? 'rm-dot--na' : s.on ? 'rm-dot--on' : 'rm-dot--off'}`} title={`${s.id.replace('_', ' ')} · ${s.on === null ? 'no live data' : s.on ? 'on' : 'off'}`} />
      ))}
    </span>
  );
}
