'use client';

/**
 * Finished stock by size — one bar per strip size, split into stock with an order against
 * it and free stock, by the plant's stock query (ERP stock ledger, S1 finished goods, every
 * godown but STOR1P) counted to the end of the Duration period. The ERP does not link yard stock to sales orders (loading advices only
 * reserve it, and stale ones stay open), so nothing can be shown as with order: every bar
 * is free stock — the same rule as production, which is all Made To Stock.
 *
 * The count runs over the whole ledger, which carries the opening, so a size is its true
 * stock; one that still comes out below zero is not drawn.
 * Plain, "Direct" and defective variants of one size are separate ERP items; the plain and
 * Direct ones are summed. Defective strip is shown on its own tab, never mixed with prime stock.
 *
 * No drill-down: the panel IS the breakdown by size, and the stock over time opens from the
 * Free stock card and the Order allocation panel.
 */
import { useMemo, useState } from 'react';
import Panel from '@/components/Panel';
import { Seg } from '@/components/drill/DrillDrawer';
import { fixed } from '@/lib/num';
import { dm } from '@/services/hsmProduction';
import { useFinishedStock } from '@/components/production/useFinishedStock';

/** Below this a size is "nil", not stock — the ERP's own rounding. */
const MIN_MT = 0.05;

interface Row { key: string; label: string; defective: boolean; stockMt: number }
type Tab = 'prime' | 'defective';

export default function StockBySize() {
  const { data, error, asOf, fromLedger } = useFinishedStock();
  const [tab, setTab] = useState<Tab>('prime');

  const all = useMemo(() => {
    const bySize = new Map<string, Row>();
    for (const s of data?.sizes ?? []) {
      const key = `${s.label}${s.defective ? ' · defective' : ''}`;
      const r = bySize.get(key) ?? { key, label: s.label, defective: s.defective, stockMt: 0 };
      r.stockMt += s.stockMt;
      bySize.set(key, r);
    }
    return [...bySize.values()].map((r) => ({ ...r, stockMt: Math.round(r.stockMt * 100) / 100 }));
  }, [data]);
  /** One tab's sizes in stock (sizes below zero are not drawn). */
  const view = (t: Tab) => ({
    rows: all.filter((r) => r.defective === (t === 'defective') && r.stockMt > MIN_MT).sort((a, b) => b.stockMt - a.stockMt),
  });
  const { rows } = view(tab);
  const counts = { prime: view('prime').rows.length, defective: view('defective').rows.length };
  const max = rows[0]?.stockMt ?? 1;

  const sub = `ERP · at end of ${asOf ? dm(asOf) : '—'}${fromLedger && data ? ` · since ${dm(data.basis.from)} ’25` : ''}`;

  return (
    <Panel
      title="Finished stock by size"
      sub={sub}
      right={
        <Seg
          label="Stock grade"
          value={tab}
          onChange={setTab}
          options={[
            { id: 'prime', label: data ? `Prime · ${counts.prime}` : 'Prime', title: 'Prime strip in stock, by size' },
            { id: 'defective', label: data ? `Defective · ${counts.defective}` : 'Defective', title: 'Defective strip in stock, by size' },
          ]}
        />
      }
      className="rm-panel"
      bodyClass="rm-body"
    >
      {!data ? (
        error ? <p className="rm-empty">{error}</p> : <span className="skel skel--block" style={{ height: 150 }} role="status" aria-label="Loading" />
      ) : rows.length === 0 ? (
        <div className="rm-empty">
          <p>No {tab === 'defective' ? 'defective' : 'prime'} strip in stock at the end of {dm(data.asOf)} — ERP movements entered up to {dm(data.erp.lastDate)}.</p>
        </div>
      ) : (
        <>
          <div className="rm-sizes-scroll">
            <ul className="rm-sizes" aria-label={`${rows.length} ${tab === 'defective' ? 'defective ' : ''}sizes in stock`}>
              {rows.map((r) => (
                <li key={r.key}>
                  <div className="rm-size rm-size--stock">
                    <span className="rm-size-name">{r.label}</span>
                    {/* The size's stock; no with-order / free split (the user, 27 Oct 2026). */}
                    <span className="rm-size-stack" aria-hidden>
                      <i className="rm-tone--free" style={{ width: `${(r.stockMt / max) * 100}%` }} />
                    </span>
                    <span className="rm-size-total num">{fixed(r.stockMt, 1)} MT</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </Panel>
  );
}
