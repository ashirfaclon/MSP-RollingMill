'use client';

/**
 * The Production headline card, from the plant historian: the Influx counter
 * Total_Production_Ton, its increases summed per 06:00 plant day, over the period chosen
 * in the Duration filter (no shift filter). Live — today counts up as the mill rolls.
 * Chosen by the plant over the ERP figure, which arrives 1–2 days late. Clicking it opens
 * the ERP-vs-Influx drawer, where the two can be compared day by day.
 *
 * Two figures: TOTAL — the counter as it is (reset events less noise) — and NET — total
 * less the four by-products booked in ERP stores (mill scale, strip end cut, miss-roll
 * strip, strip finish end cut). The by-products arrive 1–2 days late, so the note says
 * when net is still waiting for them. The counter publishes from 21 Sep 2026 only.
 */
import { useState } from 'react';
import KpiCard from '@/components/visualization/KpiCard';
import ProductionDrawer from './ProductionDrawer';
import { COUNTER_START_DATE, addDays, dm, useProduction, useSelection } from '@/services/hsmProduction';

export default function ProductionKpiCard() {
  const { dates, today } = useSelection();
  const [open, setOpen] = useState(false);
  const { data, loading, error } = useProduction(dates ? { ...dates, grain: 'day' } : null);
  const current = data && dates && data.from === dates.from && data.to === dates.to ? data : null;

  let total: number | null = null;
  let net: number | null = null;
  let note = error ? 'Mill counter unavailable' : 'Loading…';
  if (current) {
    const t = current.totals;
    total = t.influxMt;
    net = t.netMt ?? null;
    // The plant day still being rolled: today, or yesterday's date before 06:00.
    const running = !!today && current.days.some((d) => d.date >= addDays(today, -1) && d.influxCoverage === 'partial');
    const counterDays = current.days.filter((d) => d.influxMt !== null).length;
    if (current.influx.connection === 'down') note = current.influx.message;
    else if (t.influxMt === null) note = `No counter data · starts ${dm(COUNTER_START_DATE)}`;
    else if (!t.byProductDays) note = `Net awaits ERP losses (booked to ${dm(current.byProductsLastDate)})${running ? ' · live' : ''}`;
    else if (t.byProductDays < counterDays) note = `Net: losses booked ${t.byProductDays} of ${counterDays} days (to ${dm(current.byProductsLastDate)})`;
    else note = '';
  }
  const fmt1 = (v: number | null) => (v === null ? 'NA' : v.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

  return (
    <>
      <KpiCard
        label="Production"
        value={fmt1(total)}
        pair={current ? [{ source: 'Total', value: fmt1(total) }, { source: 'Net', value: fmt1(net) }] : undefined}
        unit="MT"
        note={note}
        series="prod"
        loading={(loading && !data) || (!current && !error)}
        onOpen={() => setOpen(true)}
        openLabel="Compare the mill counter with ERP production"
      />
      <ProductionDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
