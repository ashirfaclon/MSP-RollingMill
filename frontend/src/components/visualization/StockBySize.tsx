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
 * Direct ones are summed. Defective strip is called "Subprime" (the user, 30 Oct 2026). Three
 * tabs: All (the default — ONE row per size, its bar prime in amber with the subprime part in
 * violet straight after it), Prime, Subprime; the tab's total stock sits in the title bar. A
 * subprime item the ERP names without a thickness ("358–360") matches no prime size and keeps
 * its own row.
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
import { stockDate } from '@/components/production/stockAsOf';

/** Below this a size is "nil", not stock — the ERP's own rounding. */
const MIN_MT = 0.05;

/** One size: its prime and subprime stock (each 0 when that grade has none, or is below zero). */
interface Row { key: string; label: string; primeMt: number; subMt: number }
type Tab = 'all' | 'prime' | 'defective';

export default function StockBySize() {
  const { data, error, asOf, fromLedger } = useFinishedStock();
  const [tab, setTab] = useState<Tab>('all');

  const all = useMemo(() => {
    const bySize = new Map<string, { label: string; prime: number; sub: number }>();
    for (const s of data?.sizes ?? []) {
      const r = bySize.get(s.label) ?? { label: s.label, prime: 0, sub: 0 };
      if (s.defective) r.sub += s.stockMt; else r.prime += s.stockMt;
      bySize.set(s.label, r);
    }
    /* A grade below the ERP's rounding, or below zero, is not stock: it draws nothing. */
    const part = (v: number) => (v > MIN_MT ? Math.round(v * 100) / 100 : 0);
    return [...bySize.values()].map((r): Row => ({ key: r.label, label: r.label, primeMt: part(r.prime), subMt: part(r.sub) }));
  }, [data]);
  /** The stock a row shows on a tab. */
  const shown = (r: Row, t: Tab) => (t === 'all' ? r.primeMt + r.subMt : t === 'prime' ? r.primeMt : r.subMt);
  const view = (t: Tab) => ({ rows: all.filter((r) => shown(r, t) > 0).sort((a, b) => shown(b, t) - shown(a, t)) });
  const { rows } = view(tab);
  const counts = { all: view('all').rows.length, prime: view('prime').rows.length, defective: view('defective').rows.length };
  const max = rows.length ? shown(rows[0], tab) : 1;
  /* The tab's total: All = the ERP's finished stock, the same figure as the Finished stock card (the user, 31 Oct 2026);
     Prime / Subprime = the sizes the tab lists, added up. */
  const totalMt = tab === 'all' && data ? data.totals.stockMt : rows.reduce((a, r) => a + shown(r, tab), 0);
  /* The date the stock is counted to — as the Finished stock card, on every mill. */
  const counted = data ? stockDate(data.asOf, data.erp.lastDate) : asOf;

  const sub = `ERP · at end of ${counted ? dm(counted) : '—'}${fromLedger && data ? ` · since ${dm(data.basis.from)} ’25` : ''}`;

  return (
    <Panel
      title="Finished stock by size"
      sub={sub}
      right={
        <>
          {data && <span className="rm-sizes-total" aria-label="Total of the sizes listed">Total <b className="num">{fixed(totalMt, 1)} MT</b></span>}
          <Seg
            label="Stock grade"
            value={tab}
            onChange={setTab}
            options={[
              { id: 'all', label: 'All', title: data ? `Every size in stock, prime and subprime · ${counts.all} sizes` : 'Every size in stock, prime and subprime' },
              { id: 'prime', label: 'Prime', title: data ? `Prime strip in stock, by size · ${counts.prime} sizes` : 'Prime strip in stock, by size' },
              { id: 'defective', label: 'Subprime', title: data ? `Subprime strip in stock, by size · ${counts.defective} sizes` : 'Subprime strip in stock, by size' },
            ]}
          />
        </>
      }
      className="rm-panel"
      bodyClass="rm-body"
    >
      {!data ? (
        error ? <p className="rm-empty">{error}</p> : <span className="skel skel--block" style={{ height: 150 }} role="status" aria-label="Loading" />
      ) : rows.length === 0 ? (
        <div className="rm-empty">
          <p>No {tab === 'defective' ? 'subprime ' : tab === 'prime' ? 'prime ' : ''}strip in stock at the end of {dm(data.asOf)} — ERP movements entered up to {dm(data.erp.lastDate)}.</p>
        </div>
      ) : (
        <>
          {tab === 'all' && (
            <div className="rm-sizes-legend" aria-hidden><i className="rm-tone--free" />Prime<i className="rm-tone--subprime" />Subprime</div>
          )}
          <div className="rm-sizes-scroll">
            <ul className="rm-sizes" aria-label={`${rows.length} ${tab === 'defective' ? 'subprime ' : tab === 'prime' ? 'prime ' : ''}sizes in stock`}>
              {rows.map((r) => (
                <li key={r.key}>
                  <div className={`rm-size rm-size--stock${tab === 'defective' ? ' rm-size--subprime' : ''}`}
                    title={tab === 'all' && r.subMt > 0 ? `Prime ${fixed(r.primeMt, 1)} MT · Subprime ${fixed(r.subMt, 1)} MT` : undefined}>
                    <span className="rm-size-name">{r.label}</span>
                    {/* The size's stock; no with-order / free split (the user, 27 Oct 2026). Prime amber, then subprime violet on the same bar. */}
                    <span className="rm-size-stack rm-size-stack--flush" aria-hidden>
                      {tab !== 'defective' && r.primeMt > 0 && <i className="rm-tone--free" style={{ width: `${(r.primeMt / max) * 100}%` }} />}
                      {tab !== 'prime' && r.subMt > 0 && <i className="rm-tone--subprime" style={{ width: `${(r.subMt / max) * 100}%` }} />}
                    </span>
                    <span className="rm-size-total num">{fixed(shown(r, tab), 1)} MT</span>
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
