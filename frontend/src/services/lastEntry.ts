'use client';

/**
 * The last recorded entry, for a card whose figure is NA in the selected period because nothing
 * has been entered yet (the user, 30 Oct 2026): the card shows the most recent day that has
 * data, and says so — "Last entry · 27 Oct".
 *
 * Every report names the latest date its source has data for (the ERP's `erp.lastDate`, a
 * logbook form's `lastDate`, the historian's last reading). When the period has no figure and
 * that date falls before the period, the same endpoint is asked for that one day. One extra
 * request, made only when needed.
 */
import { useApi } from './hsmApi';
import { dm } from '@/lib/plantDay';
import { rmdModeQuery } from '@/state/globalSel';

export interface LastEntry<T> {
  /** The report for the last day with data; null while loading, or when there is none. */
  data: T | null;
  /** That day (YYYY-MM-DD). */
  date: string | null;
}

/**
 * `path`: the endpoint (no query); `query`: extra parameters (e.g. "grain=day"); `need`: the
 * period's figure is NA; `lastDate`: the source's latest date with data; `from`: the period's
 * first day. Asks only when the last date is before the period.
 */
export function useLastEntry<T>(path: string | null, need: boolean, lastDate: string | null | undefined, from: string | null | undefined, query = ''): LastEntry<T> {
  const date = need && path && lastDate && from && lastDate < from ? lastDate : null;
  const url = date ? `${path}?from=${date}&to=${date}${query ? `&${query}` : ''}${path ? rmdModeQuery(path) : ''}` : null;
  const s = useApi<T>(url);
  return { data: url && s.dataUrl === url ? s.data : null, date };
}

/** The card's note for a last entry: "Last entry · 27 Oct". */
export const lastEntryNote = (date: string) => `Last entry · ${dm(date)}`;

/**
 * A card's `lastEntry`: when the period's figure `v` is NA, the same figure from the last day's
 * report, formatted as the card formats it; null otherwise (the card then says "No entries
 * recorded yet" if its source has never had one).
 */
export function lastFigure<T>(
  v: number | null | undefined, last: LastEntry<T>, pick: (d: T) => number | null | undefined, fmt: (n: number) => string,
): { value: string; date: string } | null {
  if (v != null || !last.data || !last.date) return null;
  const lv = pick(last.data);
  return lv == null ? null : { value: fmt(lv), date: last.date };
}
