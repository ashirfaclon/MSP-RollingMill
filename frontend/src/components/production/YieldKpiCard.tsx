'use client';

/**
 * Mass yield for the Duration filter's period — one figure, from Influx (plant's rule):
 *   input   Σ per billet-size event (billets × L×B×H × 7.832 g/cm³);
 *   output  NET production = the counter (reset events less noise) less the four
 *           by-products booked in ERP stores (mill scale, strip end cut, miss-roll strip,
 *           strip finish end cut).
 * Counted over the days whose by-products are booked (they arrive 1–2 days late). The
 * drawer shows it per day beside the ERP yield.
 */
import KpiCard from '@/components/visualization/KpiCard';
import { useLogSheetDrawer } from '@/components/drill/LogSheetDrawer';
import { fixed } from '@/lib/num';
import { dm, useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type YieldComparison } from '@/services/hsmApi';

export function useYield() {
  const { dates } = useSelection();
  const url = dates ? rangeUrl('/api/hsm/yield', { ...dates, grain: 'day' }) : null;
  const s = useApi<YieldComparison>(url);
  return { current: s.data && s.dataUrl === url ? s.data : null, error: s.error };
}

export default function YieldKpiCard() {
  const { current, error } = useYield();
  const logSheet = useLogSheetDrawer();
  const t = current?.totals;

  let note = error ? 'Data unavailable' : 'Loading…';
  if (t && current) {
    if (!t.influxDays) note = 'No counter data';
    else if (!t.netDays) note = `Awaits ERP losses (booked to ${dm(current.byProductsLastDate)})`;
    else if (t.netDays < t.influxDays) note = `Net ÷ input · ${t.netDays} of ${t.influxDays} days have losses booked`;
    else note = '';
  }

  return (
    <>
      <KpiCard
        label="Mass yield"
        value={t?.netYieldPct === null || t?.netYieldPct === undefined ? 'NA' : fixed(t.netYieldPct, 1)}
        unit="%"
        note={note}
        series="order"
        meterPct={t?.netYieldPct ?? undefined}
        loading={!current && !error}
        onOpen={() => logSheet.open('yield')}
        openLabel="Yield per day: Influx net output ÷ Influx input, with the ERP yield beside it"
      />
      {logSheet.drawer}
    </>
  );
}
