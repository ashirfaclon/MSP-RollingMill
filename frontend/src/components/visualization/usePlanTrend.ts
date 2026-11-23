'use client';

/**
 * The days of the Production vs plan strip: the period's own days, or — for a one-day period — the
 * seven days up to it, so a single day's compliance still has its trend (the user, 24 Nov 2026).
 */
import { addDays } from '@/lib/plantDay';
import { rangeUrl, useApi } from '@/services/hsmApi';
import type { PlanTrendDay } from './ShiftBars';

const TREND_DAYS = 7;

export function usePlanTrend(
  path: string, dates: { from: string; to: string } | null, days: PlanTrendDay[] | null,
): { days: PlanTrendDay[]; selected?: string | null } | null {
  const single = !!dates && dates.from === dates.to;
  const url = single ? rangeUrl(path, { from: addDays(dates!.to, 1 - TREND_DAYS), to: dates!.to }) : null;
  const s = useApi<{ days: PlanTrendDay[] }>(url);
  if (single) return s.data && s.dataUrl === url ? { days: s.data.days, selected: dates!.to } : null;
  return days ? { days } : null;
}
