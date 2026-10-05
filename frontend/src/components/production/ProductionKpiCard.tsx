'use client';

/**
 * The Production headline card, from the plant historian: the Influx counter
 * Total_Production_Ton, its increases summed per 06:00 plant day, over the period chosen
 * in the Duration filter (no shift filter). Live — today counts up as the mill rolls.
 * Chosen by the plant over the ERP figure, which arrives 1–2 days late. Clicking it opens
 * the ERP-vs-Influx drawer, where the two can be compared day by day.
 *
 * The counter is billet-based (billets × set billet weight), so it reads a few percent
 * above the ERP's finished production; the drawer shows that gap. It publishes from
 * 21 Sep 2026 only, and the note says when a period is not fully covered.
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

  let value = 'NA';
  let note = error ? 'Mill counter unavailable' : 'Loading…';
  if (current) {
    const t = current.totals;
    value = t.influxMt === null ? 'NA' : t.influxMt.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    // The plant day still being rolled: today, or yesterday's date before 06:00.
    const running = !!today && current.days.some((d) => d.date >= addDays(today, -1) && d.influxCoverage === 'partial');
    if (current.influx.connection === 'down') note = current.influx.message;
    else if (t.influxMt === null) note = `No counter data · starts ${dm(COUNTER_START_DATE)}`;
    else if (t.days === 1 && running) note = 'Influx · live since 06:00';
    else if (t.influxFullDays < t.days) note = `Influx · ${t.influxFullDays} of ${t.days} full days${running ? ' · today running' : ''}`;
    else note = `Influx · ${t.days} day${t.days > 1 ? 's' : ''}`;
  }

  return (
    <>
      <KpiCard
        label="Production"
        value={value}
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
