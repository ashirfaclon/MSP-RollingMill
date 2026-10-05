'use client';

/**
 * Mass yield for the Duration filter's period, two ways side by side (plant's request):
 *   ERP     Σ production ÷ Σ billet input, Production Log Sheet (closed days, 1–2 days late);
 *   Influx  Total_Production_Ton ÷ Σ per billet-size event (billets × L×B×H × 7.832 g/cm³), live.
 * The Influx output is coils × the set billet weight, not weighed strip, so its yield is
 * really coils ÷ billets — the drawer shows the counts next to it. Opens the Yield view.
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
    const erp = !t.erpDays ? `ERP not entered (to ${dm(current.erp.lastDate)})`
      : t.erpDays < t.days ? `ERP ${t.erpDays}/${t.days} d` : `ERP ${t.days} d`;
    const inf = !t.influxDays ? 'Influx no data' : t.influxFullDays < t.influxDays ? 'Influx live' : `Influx ${t.influxDays} d`;
    note = `${erp} · ${inf}`;
  }

  return (
    <>
      <KpiCard
        label="Mass yield"
        value="NA"
        unit="%"
        note={note}
        series="order"
        pair={t ? [
          { source: 'ERP', value: t.erpYieldPct === null ? 'NA' : fixed(t.erpYieldPct, 1) },
          { source: 'Influx', value: t.influxYieldPct === null ? 'NA' : fixed(t.influxYieldPct, 1) },
        ] : undefined}
        meterPct={t?.erpYieldPct ?? undefined}
        loading={!current && !error}
        onOpen={() => logSheet.open('yield')}
        openLabel="Yield per day: ERP against Influx"
      />
      {logSheet.drawer}
    </>
  );
}
