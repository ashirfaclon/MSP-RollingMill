'use client';

/** The Production card's figure for the Duration period (Influx, MT), for panels that show it too. */
import { useProduction, useSelection } from '@/services/hsmProduction';

export function useProductionForSelection(): { mt: number | null; loading: boolean } {
  const { dates } = useSelection();
  const { data, error } = useProduction(dates ? { ...dates, grain: 'day' } : null);
  const current = data && dates && data.from === dates.from && data.to === dates.to ? data : null;
  return { mt: current?.totals.influxMt ?? null, loading: !current && !error };
}
