'use client';

/**
 * "Finished stock" in the Order allocation panel: the title and the total, live from the ERP
 * stock ledger, counted to the end of the Duration period. Opens the same stock drawer as
 * the Free stock card (the same figure).
 */
import { useState } from 'react';
import StockDrawer from '@/components/drill/StockDrawer';
import { fixed } from '@/lib/num';
import { useFinishedStock } from './useFinishedStock';

export default function FinishedStockBlock() {
  const { data, loading, error } = useFinishedStock();
  const [open, setOpen] = useState(false);

  return (
    <div className="rm-alloc-block">
      <button type="button" className="rm-alloc-head rm-alloc-head--button" onClick={() => setOpen(true)} aria-haspopup="dialog" title="Stock received, issued and held, per day">
        <span className="rm-k">Finished stock</span>
        <span className="rm-alloc-total num v-val">
          {data ? `${fixed(data.totals.stockMt, 1)} MT` : error ? 'NA' : <span className="skel skel--num" role="status" aria-label="Loading" />}
        </span>
      </button>
      <StockDrawer open={open} onClose={() => setOpen(false)} data={data} loading={loading} error={error} />
    </div>
  );
}
