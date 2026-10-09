/**
 * Day → period grouping for drawers whose API returns days only. Mirrors the backend's
 * `periodOf` (production.service.ts) so a week or month is labelled and bounded the same
 * in every drawer: weeks start on Monday, months are calendar months.
 */
import type { Grain } from '@contracts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;

/** "2026-09-22" → "22 Sep". */
const label = (date: string) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;

export function periodOf(date: string, grain: Grain): { key: string; label: string } {
  if (grain === 'day') return { key: date, label: label(date) };
  if (grain === 'month') return { key: date.slice(0, 7), label: `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}` };
  const ms = Date.parse(`${date}T00:00:00Z`);
  const dow = (new Date(ms).getUTCDay() + 6) % 7;
  const monday = new Date(ms - dow * DAY_MS).toISOString().slice(0, 10);
  return { key: `W${monday}`, label: `Week of ${label(monday)}` };
}

/** Days → periods in date order, each with its first and last date. */
export function groupDays<T extends { date: string }>(days: T[], grain: Grain) {
  const groups = new Map<string, { key: string; label: string; days: T[] }>();
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const p = periodOf(d.date, grain);
    const g = groups.get(p.key) ?? { ...p, days: [] };
    g.days.push(d);
    groups.set(p.key, g);
  }
  return [...groups.values()].map((g) => ({ ...g, fromDate: g.days[0].date, toDate: g.days[g.days.length - 1].date }));
}

/** Days in an inclusive date range. */
export const dayCount = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;

/**
 * The grouping a drawer opens on, from the period's length — so a long period opens on a
 * readable number of rows: up to 2 weeks by day, up to 3 months by week, longer by month.
 */
export function autoGrain(dates: { from: string; to: string } | null): Grain {
  if (!dates) return 'day';
  const n = dayCount(dates.from, dates.to);
  return n <= 14 ? 'day' : n <= 92 ? 'week' : 'month';
}
