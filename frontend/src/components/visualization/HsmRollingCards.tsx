'use client';

/**
 * HSM: the plant's management KPIs from the ERP log sheet (HSM.xlsx, the user, 23 Nov 2026), for the
 * Rolling chosen in the top bar:
 *   Both     after the five headline cards: cast, delivery, prime (Online + Offline added), rolling w.r.t.
 *            casting / delivery (Online), cold power (Offline; kWh | kWh/MT in one card) and breakdown — two
 *            rows of six;
 *   Online   alone, one row of seven: the Online production, cast, delivery, prime, the two rolling
 *            percentages and breakdown;
 *   Offline  alone, one row of six: the Offline production, cast, delivery, prime, cold power and breakdown
 *            (the headline five are hidden under either — the user, 24 Nov 2026).
 * Breakdown (DELAY_HRS) is its own card with its own drill-down, as on LSM (the user, 25 Nov 2026).
 * The rolling percentages are always the Online entries' (Offline's are filled 100 % just to fill them)
 * and cold power always the Offline entries' — so neither shows under the other rolling.
 */
import { useState } from 'react';
import KpiCard from './KpiCard';
import HsmRollingDrawer from '@/components/drill/HsmRollingDrawer';
import LogMetricDrawer from '@/components/drill/LogMetricDrawer';
import { useErpPeriod } from '@/components/production/useErpPeriod';
import { fixed } from '@/lib/num';
import { lastFigure, useLastEntry } from '@/services/lastEntry';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type HsmRollingPeriod, type HsmRollingReport } from '@/services/hsmApi';
import { useGlobalSel, type RmdModeSel } from '@/state/globalSel';

type Key = 'productionMt' | 'castMt' | 'deliveryMt' | 'primeMt' | 'rollingInCastingPct' | 'rollingInDeliveryPct';
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
/** Both: the headline Production card is already the Online + Offline total, so it is not repeated. */
const CARDS: Record<RmdModeSel, Card[]> = {
  all: [...QTY, ...ROLLING],
  online: [PRODUCTION, ...QTY, ...ROLLING],
  offline: [PRODUCTION, ...QTY],
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
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  // Breakdown hours: the log sheet's DELAY_HRS for the Rolling chosen (the same report as Material balance).
  const log = useErpPeriod();
  const lt = log.current?.totals;
  const t: HsmRollingPeriod | null = data?.totals ?? null;
  const note = s.error ? 'ERP data unavailable' : data?.erp.connection === 'down' ? data.erp.message : '';
  const num = (n: number, dp: number) => fixed(n, dp);

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
      {/* Cold power is the Offline entries': total and per tonne in one card. */}
      {mode !== 'online' && (
        <KpiCard
          label="Cold power"
          term={TERM.offline}
          value={t?.coldPowerKwh == null ? 'NA' : num(t.coldPowerKwh, 2)}
          pair={t ? [
            { source: 'kWh', value: t.coldPowerKwh == null ? 'NA' : num(t.coldPowerKwh, 2) },
            { source: 'kWh/MT', value: t.coldPowerKwhPerMt == null ? 'NA' : num(t.coldPowerKwhPerMt, 2) },
          ] : undefined}
          noEntries={up && t?.coldPowerKwh == null}
          unit=""
          note={note}
          series="hold"
          loading={!data && !s.error}
          onOpen={() => setOpen(true)}
          openLabel="Cold power per day, from the ERP log sheet"
        />
      )}
      <KpiCard
        label="Breakdown"
        term={TERM[mode]}
        value={lt?.entryDays ? fixed(lt.breakdownHrs) : 'NA'}
        noEntries={!!log.current && log.current.erp.connection === 'up' && !lt?.entryDays}
        unit="h"
        note={log.error ? 'ERP data unavailable' : log.current?.erp.connection === 'down' ? log.current.erp.message : ''}
        series="reject"
        loading={log.loading}
        onOpen={() => setBreakdownOpen(true)}
        openLabel="Breakdown hours per day, from the ERP log sheet"
      />
      <LogMetricDrawer metric={breakdownOpen ? 'breakdownHrs' : null} onClose={() => setBreakdownOpen(false)} />
      <HsmRollingDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
