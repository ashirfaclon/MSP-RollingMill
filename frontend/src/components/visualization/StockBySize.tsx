'use client';

/**
 * Finished stock by size — one bar per strip size, split into stock with an order against
 * it and free stock, from the ERP stock ledger (FG yard FGYRDP) counted to the end of the
 * Duration period. The ERP does not link yard stock to sales orders (loading advices only
 * reserve it, and stale ones stay open), so nothing can be shown as with order: every bar
 * is free stock — the same rule as production, which is all Made To Stock.
 *
 * The ledger has no opening balance for this year, so each size is the CHANGE since the ERP
 * go-live (30 Nov 2025): a size dispatched from stock held before then comes out below
 * zero. Those are counted in the footer and listed in the drawer, not drawn as bars.
 * Plain, "Direct" and defective variants of one size are separate ERP items; the plain and
 * Direct ones are summed, defective stays its own row.
 */
import { useMemo, useState } from 'react';
import Panel from '@/components/Panel';
import StockDrawer from '@/components/drill/StockDrawer';
import SizesDrawer from '@/components/drill/SizesDrawer';
import { fixed } from '@/lib/num';
import { dm } from '@/services/hsmProduction';
import { useFinishedStock } from '@/components/production/useFinishedStock';

/** Below this a size is "nil", not stock — the ERP's own rounding. */
const MIN_MT = 0.05;

interface Row { key: string; label: string; defective: boolean; stockMt: number }

export default function StockBySize() {
  const { data, loading, error, asOf, fromLedger } = useFinishedStock();
  const [stock, setStock] = useState(false);
  const [sizes, setSizes] = useState(false);

  const { rows, below, belowMt } = useMemo(() => {
    const bySize = new Map<string, Row>();
    for (const s of data?.sizes ?? []) {
      const key = `${s.label}${s.defective ? ' · defective' : ''}`;
      const r = bySize.get(key) ?? { key, label: s.label, defective: s.defective, stockMt: 0 };
      r.stockMt += s.stockMt;
      bySize.set(key, r);
    }
    const all = [...bySize.values()].map((r) => ({ ...r, stockMt: Math.round(r.stockMt * 100) / 100 }));
    const neg = all.filter((r) => r.stockMt < -MIN_MT);
    return {
      rows: all.filter((r) => r.stockMt > MIN_MT).sort((a, b) => b.stockMt - a.stockMt),
      below: neg.length,
      belowMt: neg.reduce((a, r) => a + r.stockMt, 0),
    };
  }, [data]);
  const inStockMt = rows.reduce((a, r) => a + r.stockMt, 0);
  const max = rows[0]?.stockMt ?? 1;

  const sub = `ERP · at end of ${asOf ? dm(asOf) : '—'}${fromLedger && data ? ` · since ${dm(data.basis.from)} ’25` : ''}`;

  return (
    <Panel
      title="Finished stock by size"
      sub={sub}
      right={
        <span className="rm-legend rm-legend--head" aria-label="Series">
          <span className="rm-chip-series rm-tone--order">With order</span>
          <span className="rm-chip-series rm-tone--free">Free stock</span>
        </span>
      }
      className="rm-panel"
      bodyClass="rm-body"
    >
      {!data ? (
        error ? <p className="rm-empty">{error}</p> : <span className="skel skel--block" style={{ height: 150 }} role="status" aria-label="Loading" />
      ) : rows.length === 0 ? (
        <div className="rm-empty">
          <p>No size in stock at the end of {dm(data.asOf)} — ERP movements entered up to {dm(data.erp.lastDate)}.</p>
          <button type="button" className="rm-link-btn" onClick={() => setStock(true)} aria-haspopup="dialog">Open the stock ledger</button>
        </div>
      ) : (
        <>
          <div className="rm-sizes-scroll">
            <ul className="rm-sizes" aria-label={`${rows.length} sizes in stock`}>
              {rows.map((r) => (
                <li key={r.key}>
                  <button
                    type="button"
                    className="rm-size rm-size--button rm-size--stock"
                    onClick={() => setStock(true)}
                    aria-haspopup="dialog"
                    aria-label={`${r.label} mm${r.defective ? ' defective' : ''}: with order 0.0 MT, free stock ${fixed(r.stockMt, 1)} MT`}
                  >
                    <span className="rm-size-name">
                      {r.label}
                      {r.defective && <span className="rm-size-tag">defective</span>}
                    </span>
                    {/* With order first (none in the ERP), then free stock — as on the comp. */}
                    <span className="rm-size-stack" aria-hidden>
                      <i className="rm-tone--order" style={{ width: '0%' }} />
                      <i className="rm-tone--free" style={{ width: `${(r.stockMt / max) * 100}%` }} />
                    </span>
                    <span className="rm-size-total num">{fixed(r.stockMt, 1)} MT</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="rm-sizes-foot">
            <button type="button" className="rm-link-btn" onClick={() => setStock(true)} aria-haspopup="dialog" title="Stock per size, including the sizes below zero">
              {rows.length} size{rows.length === 1 ? '' : 's'} in stock · {fixed(inStockMt, 1)} MT
              {below > 0 && ` · ${below} below zero (${fixed(belowMt, 1)} MT)`}
              {' · '}net {fixed(data.totals.stockMt, 1)} MT
            </button>
            <button type="button" className="rm-link-btn" onClick={() => setSizes(true)} aria-haspopup="dialog">
              Produced &amp; dispatched by size
            </button>
          </div>
        </>
      )}
      <StockDrawer open={stock} onClose={() => setStock(false)} data={data} loading={loading} error={error} />
      {sizes && <SizesDrawer open onClose={() => setSizes(false)} initial="selection" />}
    </Panel>
  );
}
