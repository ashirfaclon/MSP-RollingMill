'use client';

/**
 * HSM: the plant's management KPIs from the ERP log sheet (HSM.xlsx, the user, 23 Nov 2026), after the
 * five headline cards, for the Rolling chosen in the top bar:
 *   Both     cast, delivery, prime (Online + Offline added), rolling w.r.t. casting / delivery (Online),
 *            cold power and cold power per tonne (Offline) — with the headline five, two rows of six;
 *   Online   the Online production, cast, delivery, prime and the two rolling percentages;
 *   Offline  the Offline production, cast, delivery, prime and the two cold power figures.
 * The rolling percentages are always the Online entries' (Offline's are filled 100 % just to fill them)
 * and cold power always the Offline entries' — so neither shows under the other rolling.
 */
import { useState } from 'react';
import KpiCard from './KpiCard';
import HsmRollingDrawer from '@/components/drill/HsmRollingDrawer';
import { fixed } from '@/lib/num';
import { lastFigure, useLastEntry } from '@/services/lastEntry';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type HsmRollingPeriod, type HsmRollingReport } from '@/services/hsmApi';
import { useGlobalSel, type RmdModeSel } from '@/state/globalSel';

type Key = 'productionMt' | 'castMt' | 'deliveryMt' | 'primeMt' | 'rollingInCastingPct' | 'rollingInDeliveryPct' | 'coldPowerKwh' | 'coldPowerKwhPerMt';
interface Card { label: string; k: Key; unit: string; dp: number; of: 'mode' | 'online' | 'offline' }

const QTY: Card[] = [
  { label: 'Cast qty', k: 'castMt', unit: 'MT', dp: 1, of: 'mode' },
  { label: 'Delivery', k: 'deliveryMt', unit: 'MT', dp: 1, of: 'mode' },
  { label: 'Prime qty', k: 'primeMt', unit: 'MT', dp: 1, of: 'mode' },
];
const PRODUCTION: Card = { label: 'Production', k: 'productionMt', unit: 'MT', dp: 1, of: 'mode' };
const ROLLING: Card[] = [
  { label: 'Rolling w.r.t. casting', k: 'rollingInCastingPct', unit: '%', dp: 1, of: 'online' },
  { label: 'Rolling w.r.t. delivery', k: 'rollingInDeliveryPct', unit: '%', dp: 1, of: 'online' },
];
const COLD: Card[] = [
  { label: 'Cold power', k: 'coldPowerKwh', unit: 'kWh', dp: 0, of: 'offline' },
  { label: 'Cold power per tonne', k: 'coldPowerKwhPerMt', unit: 'kWh/MT', dp: 1, of: 'offline' },
];
/** Both: the headline Production card is already the Online + Offline total, so it is not repeated. */
const CARDS: Record<RmdModeSel, Card[]> = {
  all: [...QTY, ...ROLLING, ...COLD],
  online: [PRODUCTION, ...QTY, ...ROLLING],
  offline: [PRODUCTION, ...QTY, ...COLD],
};
const TERM: Record<RmdModeSel, string> = { all: 'Online + Offline', online: 'Online', offline: 'Offline' };

export default function HsmRollingCards() {
  const { dates } = useSelection();
  const mode = useGlobalSel().rmdMode;
  const url = rangeUrl('/api/hsm/rolling', dates ? { ...dates, grain: 'day' } : null);
  const s = useApi<HsmRollingReport>(url);
  const data = s.data && s.dataUrl === url ? s.data : null;
  const up = !!data && data.erp.connection === 'up';
  /* No ERP entry in the period: the last day the log sheet has (the user, 30 Oct 2026). */
  const last = useLastEntry<HsmRollingReport>('/api/hsm/rolling', up && data!.totals.entryDays === 0, data?.erp.lastDate, dates?.from, 'grain=day');
  const [open, setOpen] = useState(false);
  const t: HsmRollingPeriod | null = data?.totals ?? null;
  const note = s.error ? 'ERP data unavailable' : data?.erp.connection === 'down' ? data.erp.message : '';
  const num = (n: number, dp: number) => (dp ? fixed(n, dp) : Math.round(n).toLocaleString('en-IN'));

  return (
    <>
      {CARDS[mode].map((c) => (
        <KpiCard
          key={c.k}
          label={c.label}
          term={c.of === 'mode' ? TERM[mode] : TERM[c.of]}
          value={t?.[c.k] == null ? 'NA' : num(t[c.k]!, c.dp)}
          noEntries={up && t?.[c.k] == null}
          lastEntry={lastFigure(t?.[c.k], last, (d) => d.totals[c.k], (n) => num(n, c.dp))}
          unit={c.unit}
          note={note}
          series={c.of === 'offline' ? 'hold' : c.of === 'online' ? 'ok' : 'prod'}
          loading={!data && !s.error}
          onOpen={() => setOpen(true)}
          openLabel={`${c.label} per day, from the ERP log sheet`}
        />
      ))}
      <HsmRollingDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
