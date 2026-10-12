'use client';

/**
 * The Production headline card: two figures for the period chosen in the Duration filter,
 * side by side —
 *   ERP    — the production log sheet (PRODUCTION_MT), entered 1–2 days late (no note about it);
 *   INFLUX — the mill counter Total_Production_Ton, reset events less noise, per 06:00
 *            plant day. Live — today counts up as the mill rolls. Publishes from 21 Sep 2026.
 * Clicking it opens the ERP-vs-Influx drawer, where the two are compared day by day.
 */
import { useState, type ReactNode } from 'react';
import KpiCard from '@/components/visualization/KpiCard';
import ProductionDrawer from './ProductionDrawer';
import { COUNTER_START_DATE, dm, useProduction, useSelection } from '@/services/hsmProduction';

const fmt1 = (v: number | null) => (v === null ? 'NA' : v.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

export default function ProductionKpiCard() {
  const { dates } = useSelection();
  const [open, setOpen] = useState(false);
  const { data, loading, error } = useProduction(dates ? { ...dates, grain: 'day' } : null);
  const current = data && dates && data.from === dates.from && data.to === dates.to ? data : null;

  let erp: number | null = null;
  let influx: number | null = null;
  let note: ReactNode = error ? 'Production data unavailable' : 'Loading…';
  if (current) {
    const t = current.totals;
    erp = t.erpDays ? t.erpMt : null;
    influx = t.influxMt;
    if (current.influx.connection === 'down') note = current.influx.message;
    else if (t.influxMt === null) note = `No counter data · starts ${dm(COUNTER_START_DATE)}`;
    // No coverage notes ("entered to …"). Both cover the whole period: the line under the two figures is Influx − ERP.
    else if (t.erpDays === t.days && t.varianceMt !== null) {
      // Highlighted like the shift panel's plan gap: amber when the two disagree, green when they match.
      note = (
        <span className="rm-card-delta">
          Delta <b className={`num ${Math.abs(t.varianceMt) < 0.05 ? 'v-ok' : 'v-warn'}`}>{fmt1(t.varianceMt)} MT</b>
        </span>
      );
    }
    else note = '';
  }

  return (
    <>
      <KpiCard
        label="Production"
        value={fmt1(influx)}
        pair={current ? [{ source: 'ERP', value: fmt1(erp) }, { source: 'Influx', value: fmt1(influx) }] : undefined}
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
