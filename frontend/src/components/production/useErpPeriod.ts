'use client';

/**
 * The ERP log sheet for the Duration filter's period — shared by every panel that shows a
 * log-sheet figure (one request, see useApi). `current` is null while the answer on hand
 * is for another period, so a panel never shows last period's number as this one's.
 */
import { dm, useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type LogPeriod, type LogSheetReport } from '@/services/hsmApi';

export function useErpPeriod() {
  const { dates } = useSelection();
  const url = dates ? rangeUrl('/api/hsm/logsheet', { ...dates, grain: 'day' }) : null;
  const s = useApi<LogSheetReport>(url);
  const current = s.data && s.dataUrl === url ? s.data : null;
  return {
    current,
    /** Skeleton only before the first answer for this period. */
    loading: !current && !s.error,
    error: s.error,
    /** One line on how complete the ERP is for the period. */
    note: current ? coverage(current.totals, current) : s.error ? 'ERP data unavailable' : 'Loading…',
  };
}

export function coverage(t: LogPeriod, r: LogSheetReport): string {
  if (r.erp.connection === 'down') return r.erp.message;
  if (!t.entryDays) return `Not in ERP yet · entered to ${dm(r.erp.lastDate)}`;
  if (t.entryDays < t.days) return `ERP · ${t.entryDays} of ${t.days} days · entered to ${dm(r.erp.lastDate)}`;
  return `ERP · ${t.days} day${t.days > 1 ? 's' : ''}`;
}
