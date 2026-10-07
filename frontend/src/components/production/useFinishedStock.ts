'use client';

/**
 * Finished-strip stock in the FG yard, from the ERP stock ledger, counted to the end of the
 * Duration period — one request shared by the Free stock card, the Order allocation block
 * and the stock-by-size panel (useApi dedupes the URL). `data` is null while the answer on
 * hand is for another period.
 */
import { useSelection } from '@/services/hsmProduction';
import { useApi, type StockReport } from '@/services/hsmApi';

export function useFinishedStock() {
  const { dates } = useSelection();
  const url = dates ? `/api/hsm/stock?to=${dates.to}` : null;
  const s = useApi<StockReport>(url);
  const data = s.data && s.dataUrl === url ? s.data : null;
  return {
    data,
    /** Skeleton only before the first answer for this period. */
    loading: !data && !s.error,
    error: s.error,
    /** The plant date the stock is counted to. */
    asOf: dates?.to ?? null,
    /** No opening balance in the ERP for the year: the figure is the change since go-live. */
    fromLedger: data?.basis.kind === 'ledger-start',
  };
}
