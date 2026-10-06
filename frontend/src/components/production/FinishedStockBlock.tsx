'use client';

/**
 * "Finished stock" in the Order allocation panel, live from the ERP stock ledger, counted
 * to the end of the Duration period. The Made For Order / Made To Stock split is not wired (it needs
 * the open loading advices confirmed), so it is stated rather than drawn from sample data.
 */
import { useState } from 'react';
import StockDrawer from '@/components/drill/StockDrawer';
import { fixed } from '@/lib/num';
import { dm, useSelection } from '@/services/hsmProduction';
import { useApi, type StockReport } from '@/services/hsmApi';

export default function FinishedStockBlock() {
  const { dates } = useSelection();
  const url = dates ? `/api/hsm/stock?to=${dates.to}` : null;
  const s = useApi<StockReport>(url);
  const data = s.data && s.dataUrl === url ? s.data : null;
  const [open, setOpen] = useState(false);
  const fromLedger = data?.basis.kind === 'ledger-start';

  return (
    <div className="rm-alloc-block">
      <button type="button" className="rm-alloc-head rm-alloc-head--button" onClick={() => setOpen(true)} aria-haspopup="dialog" title="Stock by day and by size">
        <span className="rm-k">Finished stock</span>
        <span className="rm-alloc-total num v-val">
          {data ? `${fixed(data.totals.stockMt, 1)} MT` : s.error ? 'NA' : <span className="skel skel--num" role="status" aria-label="Loading" />}
        </span>
      </button>
      <p className="rm-alloc-note">
        {!data ? (s.error ?? 'Loading…') : (
          <>
            ERP · at end of {dm(data.asOf)} ·{' '}
            {fromLedger
              ? <span className="v-warn">change since {dm(data.basis.from)} &apos;25 — opening stock for {data.basis.year} not in the ERP yet</span>
              : <>opening 1 Apr ({data.basis.year}) + movements</>}
          </>
        )}
      </p>
      <p className="rm-alloc-note rm-alloc-note--dim">Made For Order / Made To Stock split: not wired yet — needs the open loading advices confirmed.</p>
      <StockDrawer open={open} onClose={() => setOpen(false)} data={data} loading={!data && !s.error} error={s.error} />
    </div>
  );
}
