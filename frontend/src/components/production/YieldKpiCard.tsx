'use client';

/**
 * Mass yield for the Duration filter's period — output BEFORE quality rejection ÷ input,
 * two figures side by side:
 *   ERP     log sheet Σ PRODUCTION_MT ÷ Σ INPUT_MT (production = prime + defective +
 *           rolling defect, i.e. before rejection); entered 1–2 days late.
 *   INFLUX  net output ÷ input:
 *             input   Σ per billet-size event (billets × L×B×H × 7.832 g/cm³);
 *             output  the counter (reset events less noise) less the four by-products
 *                     booked in ERP stores (mill scale, strip end cut, miss-roll strip,
 *                     strip finish end cut) — nothing graded defective comes off.
 *           Counted over the days whose by-products are booked (they arrive 1–2 days late).
 * The drawer shows both per day.
 */
import { useState, type ReactNode } from 'react';
import KpiCard, { NO_ENTRIES } from '@/components/visualization/KpiCard';
import MassYieldDrawer, { yieldDelta } from '@/components/drill/MassYieldDrawer';
import { fixed } from '@/lib/num';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type YieldComparison } from '@/services/hsmApi';

export function useYield() {
  const { dates } = useSelection();
  const url = dates ? rangeUrl('/api/hsm/yield', { ...dates, grain: 'day' }) : null;
  const s = useApi<YieldComparison>(url);
  return { current: s.data && s.dataUrl === url ? s.data : null, error: s.error };
}

export default function YieldKpiCard() {
  const { current, error } = useYield();
  const [open, setOpen] = useState(false);
  const t = current?.totals;

  let note: ReactNode = error ? 'Data unavailable' : 'Loading…';
  if (t && current) {
    // No coverage notes ("entered to …"); the delta only when both cover the whole period.
    if (!t.influxDays) note = 'No counter data';
    else if (t.erpDays === t.days && t.netDays === t.influxDays && yieldDelta(t) !== null) {
      // Both cover the whole period: Influx − ERP, highlighted like the Production card's delta.
      const d = yieldDelta(t)!;
      note = (
        <span className="rm-card-delta">
          Delta <b className={`num ${Math.abs(d) < 0.05 ? 'v-ok' : 'v-warn'}`}>{fixed(d, 1)} %</b>
        </span>
      );
    } else if (!t.erpDays) note = <span className="rm-card-empty">ERP · {NO_ENTRIES}</span>;
    else note = '';
  }
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? 'NA' : fixed(v, 1));
  const erp = t?.erpDays ? t.erpYieldPct : null;

  return (
    <>
      <KpiCard
        label="Mass yield"
        value={pct(t?.netYieldPct)}
        pair={t ? [{ source: 'ERP', value: pct(erp) }, { source: 'Influx', value: pct(t.netYieldPct) }] : undefined}
        unit="%"
        note={note}
        series="order"
        loading={!current && !error}
        onOpen={() => setOpen(true)}
        openLabel="Yield per day, ERP and Influx"
      />
      <MassYieldDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
