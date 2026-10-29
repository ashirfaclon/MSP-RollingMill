'use client';

/**
 * The day-start hour of the mill on screen — HSM 08:00, RMD 09:00 — read from the URL
 * (/hsm/…, /rmd/…), so the Duration filter, "Today" and every cycle label follow the mill.
 */
import { usePathname } from 'next/navigation';
import { DAY_START_HOUR, PLANT_DAY_START_HOUR } from './plantDay';

export function useDayStartHour(): number {
  const mill = (usePathname() ?? '').split('/').filter(Boolean)[0] ?? '';
  return (DAY_START_HOUR as Record<string, number>)[mill] ?? PLANT_DAY_START_HOUR;
}
