'use client';

/**
 * "Finished stock" in the Order allocation panel, live from the ERP stock ledger, counted
 * to the end of the Duration period. The stock with order / free stock split is not wired (it needs
 * the open loading advices confirmed); all of it counts as free stock, like the Free stock card.
 */
import { useState } from 'react';
import StockDrawer from '@/components/drill/StockDrawer';
import { fixed } from '@/lib/num';
import { dm } from '@/services/hsmProduction';
import { useFinishedStock } from './useFinishedStock';

export default function FinishedStockBlock() {
  const { data, loading, error, fromLedger } = useFinishedStock();
  const [open, setOpen] = useState(false);

  return (
    <div className="rm-alloc-block">
      <button type="button" className="rm-alloc-head rm-alloc-head--button" onClick={() => setOpen(true)} aria-haspopup="dialog" title="Stock by day and by size">
        <span className="rm-k">Finished stock</span>
        <span className="rm-alloc-total num v-val">
          {data ? `${fixed(data.totals.stockMt, 1)} MT` : error ? 'NA' : <span className="skel skel--num" role="status" aria-label="Loading" />}
        </span>
      </button>
      {/* Only the caveat that changes how the number reads: no opening stock in the ERP yet. */}
      {error && <p className="rm-alloc-note v-warn">{error}</p>}
      {fromLedger && data && (
        <p className="rm-alloc-note v-warn">Since {dm(data.basis.from)} &apos;25 · no {data.basis.year} opening stock in ERP</p>
      )}
      <StockDrawer open={open} onClose={() => setOpen(false)} data={data} loading={loading} error={error} />
    </div>
  );
}
