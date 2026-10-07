'use client';

/**
 * "Free stock": finished strip in the FG yard at the end of the Duration period, from the
 * ERP stock ledger. The ERP does not link yard stock to sales orders, so all of it counts
 * as free (Stock with order stays 0) — the same figure as the Order allocation block and
 * the stock-by-size panel, so the three always agree. Opens the stock drawer.
 */
import { useState } from 'react';
import KpiCard from '@/components/visualization/KpiCard';
import StockDrawer from '@/components/drill/StockDrawer';
import { fixed } from '@/lib/num';
import { dm } from '@/services/hsmProduction';
import { useFinishedStock } from './useFinishedStock';

export default function FreeStockCard() {
  const { data, loading, error, fromLedger } = useFinishedStock();
  const [open, setOpen] = useState(false);
  const note = error ? 'ERP data unavailable'
    : fromLedger && data ? `Change since ${dm(data.basis.from)} ’25`   // no opening stock in the ERP yet — the drawer explains
    : '';
  return (
    <>
      <KpiCard
        label="Free stock"
        value={data ? fixed(data.totals.stockMt, 1) : 'NA'}
        unit="MT"
        note={note}
        series="free"
        meterPct={data ? 100 : 0}
        loading={loading}
        onOpen={() => setOpen(true)}
        openLabel="Finished stock by day and by size"
      />
      <StockDrawer open={open} onClose={() => setOpen(false)} data={data} loading={loading} error={error} />
    </>
  );
}
