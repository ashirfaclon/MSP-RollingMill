'use client';

/**
 * The HSM mill mimic's live figures, shared by Visualization, Asset Health and Condition Analytics
 * (the user, 26 Oct 2026: the other two screens use the Visualization mimic's Influx tags):
 *   Billet infeed     Dicharged_Billet — billets discharged since 08:00 IST today;
 *   Roughing group    On_Off of RM 1–5 — how many are on, one dot per stand;
 *   Finishing group   On_Off of FM 1–6;
 *   Finished exit     Total_Production_Ton for the Duration period (the Production card's figure).
 */
import { useApi, type GroupNow, type HsmLive } from '@/services/hsmApi';
import { useProduction, useSelection } from '@/services/hsmProduction';

export function useHsmMimic() {
  const live = useApi<HsmLive>('/api/hsm/live', 30_000);
  const { dates } = useSelection();
  const prod = useProduction(dates ? { ...dates, grain: 'day' } : null);
  const d = live.data;
  const prodNow = prod.data && dates && prod.data.from === dates.from && prod.data.to === dates.to ? prod.data : null;
  return {
    live: d,
    error: live.error,
    billetsToday: d?.billetsToday ?? null,
    group: (id: 'roughing' | 'finishing'): GroupNow | null => d?.groups.find((g) => g.id === id) ?? null,
    stands: (id: 'roughing' | 'finishing') => d?.stands.filter((s) => s.group === id) ?? [],
    exitMt: prodNow?.totals.influxMt ?? null,
  };
}
