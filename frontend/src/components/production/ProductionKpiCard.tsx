'use client';

/**
 * The Production headline card: two figures for the period chosen in the Duration filter,
 * side by side —
 *   ERP    — the production log sheet (PRODUCTION_MT), entered 1–2 days late (no note about it);
 *   INFLUX — the mill counter Total_Production_Ton, reset events less noise, per 08:00
 *            plant day. Live — today counts up as the mill rolls. Publishes from 21 Sep 2026.
 * Clicking it opens the ERP-vs-Influx drawer, where the two are compared day by day.
 */
import { useState, type ReactNode } from 'react';
import { useLastEntry } from '@/services/lastEntry';
import type { ProductionComparison } from '@/services/hsmProduction';
import KpiCard, { NO_ENTRIES } from '@/components/visualization/KpiCard';
import { productionTermText } from './productionTerm';
import ProductionDrawer from './ProductionDrawer';
import { dm, useProduction, useSelection } from '@/services/hsmProduction';

const fmt1 = (v: number | null) => (v === null ? 'NA' : v.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

export default function ProductionKpiCard() {
  const { dates } = useSelection();
  const [open, setOpen] = useState(false);
  const { data, loading, error } = useProduction(dates ? { ...dates, grain: 'day' } : null);
  const current = data && dates && data.from === dates.from && data.to === dates.to ? data : null;
  /* No ERP entry in the period: the ERP half shows the last day booked (the user, 30 Oct 2026). */
  const last = useLastEntry<ProductionComparison>('/api/hsm/production', !!current && !current.totals.erpDays, current?.erp.lastDate, dates?.from, 'grain=day');
  const lastErp = last.data?.totals.erpDays ? last.data.totals.erpMt : null;

  let erp: number | null = null;
  let influx: number | null = null;
  let note: ReactNode = error ? 'Production data unavailable' : 'Loading…';
  if (current) {
    const t = current.totals;
    erp = t.erpDays ? t.erpMt : null;
    influx = t.influxMt;
    if (current.influx.connection === 'down') note = current.influx.message;
    else if (t.influxMt === null) note = 'No counter data in this period';
    // No coverage notes ("entered to …"). Both cover the whole period: the line under the two figures is Influx − ERP.
    else if (t.erpDays === t.days && t.varianceMt !== null) {
      // Highlighted like the shift panel's plan gap: amber when the two disagree, green when they match.
      note = (
        <span className="rm-card-delta">
          Delta <b className={`num ${Math.abs(t.varianceMt) < 0.05 ? 'v-ok' : 'v-warn'}`}>{fmt1(t.varianceMt)} MT</b>
        </span>
      );
    }
    // ERP not entered for the period yet (the counter has figures): the last day booked, else say so.
    else if (!t.erpDays && lastErp !== null && last.date) note = <span className="rm-card-last">ERP · last entry · {dm(last.date)}</span>;
    else if (!t.erpDays) note = <span className="rm-card-empty">ERP · {NO_ENTRIES}</span>;
    else note = '';
  }

  return (
    <>
      <KpiCard
        label="Production"
        term={current ? productionTermText(current.from, current.to, current.erp.lastDate) : null}
        value={fmt1(influx)}
        pair={current ? [{ source: 'ERP', value: fmt1(erp ?? lastErp) }, { source: 'Influx', value: fmt1(influx) }] : undefined}
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
