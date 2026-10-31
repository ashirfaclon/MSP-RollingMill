'use client';

/**
 * Client side of /api/hsm/production, plus the plant-date helpers every HSM drawer uses.
 * Fetching itself is `useApi` (hsmApi.ts).
 */
import { useSyncExternalStore } from 'react';
import { rangeUrl, useApi } from './hsmApi';
import type { Grain, ProductionComparison } from '@contracts';
import { DURATION_LABELS, selectedDates, useGlobalSel } from '@/state/globalSel';
import { dm, plantDate } from '@/lib/plantDay';
import { useDayStartHour } from '@/lib/useDayStartHour';

export { addDays, dm, plantDate, cycleLabel } from '@/lib/plantDay';

export type { Grain, ProductionComparison, PeriodRow } from '@contracts';

const REFRESH_MS = 60_000;

/* A minute-resolution clock that re-renders subscribers, read outside render. */
const minuteNow = () => Math.floor(Date.now() / 60_000) * 60_000;
function subscribeMinute(cb: () => void) {
  const id = setInterval(cb, 15_000);
  return () => clearInterval(id);
}
/** Current minute (epoch ms); 0 during server render. */
export function useMinute(): number {
  return useSyncExternalStore(subscribeMinute, minuteNow, () => 0);
}

export interface ProductionState {
  data: ProductionComparison | null;
  /** True only while nothing has been shown yet. */
  loading: boolean;
  error: string | null;
}

export function useProduction(params: { from: string; to: string; grain: Grain } | null): ProductionState {
  const { data, loading, error } = useApi<ProductionComparison>(rangeUrl('/api/hsm/production', params), REFRESH_MS);
  return { data, loading, error };
}

/** The Duration filter as plant dates (each 08:00 → 08:00) plus its label; `today` is the current plant date. */
export function useSelection(): { dates: { from: string; to: string } | null; label: string; today: string | null } {
  const sel = useGlobalSel();
  const now = useMinute();
  const hour = useDayStartHour();
  const dates = selectedDates(sel, now, hour);
  const label = sel.duration === 'custom' && dates
    ? (dates.from === dates.to ? dm(dates.from) : `${dm(dates.from)} – ${dm(dates.to)}`)
    : DURATION_LABELS[sel.duration];
  // The plant day running now: before 08:00 IST it is still yesterday's date.
  return { dates, label, today: now ? plantDate(now, hour) : null };
}
