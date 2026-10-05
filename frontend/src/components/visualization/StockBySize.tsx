'use client';

/**
 * Strip produced and dispatched per size for the Duration period, from the ERP (stores
 * receipts and sale lines). Replaces "finished stock by size": the ERP holds no opening
 * balance for this year, so a closing stock per size cannot be computed honestly — the
 * flows in and out of the yard can. Every size is listed; a long list scrolls in the panel.
 */
import { useState } from 'react';
import Panel from '@/components/Panel';
import LegendItem from './Legend';
import { fixed } from '@/lib/num';
import SizesDrawer from '@/components/drill/SizesDrawer';
import { dm, useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type SizeReport } from '@/services/hsmApi';

export default function StockBySize() {
  const { dates } = useSelection();
  // The actual dates, not the preset's name — "Today" alone hides which day the ERP is showing.
  const period = !dates ? '—' : dates.from === dates.to ? dm(dates.from) : `${dm(dates.from)} – ${dm(dates.to)}`;
  const url = dates ? rangeUrl('/api/hsm/sizes', dates) : null;
  const s = useApi<SizeReport>(url);
  const data = s.data && s.dataUrl === url ? s.data : null;
  const [open, setOpen] = useState(false);

  // Every size in the period — the list scrolls inside the panel rather than hiding any.
  const rows = data?.rows ?? [];
  const max = Math.max(1, ...rows.map((r) => Math.max(r.producedMt, r.dispatchedMt)));
  const pct = (x: number) => `${(x / max) * 100}%`;

  return (
    <Panel
      title="Production & dispatch by size"
      sub={`ERP · ${period}`}
      right={
        <span className="rm-legend rm-legend--head">
          <LegendItem series="prod" label="Produced" />
          <LegendItem series="order" label="Dispatched" />
        </span>
      }
      className="rm-panel"
      bodyClass="rm-body"
    >
      {!data ? (
        s.error ? <p className="rm-empty">{s.error}</p> : <span className="skel skel--block" style={{ height: 150 }} role="status" aria-label="Loading" />
      ) : rows.length === 0 ? (
        <div className="rm-empty">
          <p>No strip received or dispatched in this period — ERP receipts entered up to {dm(data.erp.lastDate)}.</p>
          <button type="button" className="rm-link-btn" onClick={() => setOpen(true)} aria-haspopup="dialog">Open the last 30 days</button>
        </div>
      ) : (
        <>
          <div className="rm-sizes-scroll">
            <ul className="rm-sizes" aria-label={`${rows.length} sizes`}>
              {rows.map((r) => (
                <li key={r.key}>
                  <button
                    type="button"
                    className="rm-size rm-size--button"
                    onClick={() => setOpen(true)}
                    aria-haspopup="dialog"
                    aria-label={`${r.label} mm: produced ${fixed(r.producedMt, 1)} MT, dispatched ${fixed(r.dispatchedMt, 1)} MT`}
                  >
                    <span className="rm-size-name">
                      {r.label.replace(' · defective', '')}
                      {r.defective && <span className="rm-size-tag">defective</span>}
                    </span>
                    <span className="rm-size-bars" aria-hidden>
                      <span className="rm-size-bar rm-tone--prod"><i style={{ width: pct(r.producedMt) }} /></span>
                      <span className="rm-size-bar rm-tone--order"><i style={{ width: pct(r.dispatchedMt) }} /></span>
                    </span>
                    <span className="rm-size-val num">
                      <span className="rm-size-val-row"><span className="rm-size-val-k">Produced</span><span className="v-val">{fixed(r.producedMt, 1)}</span></span>
                      <span className="rm-size-val-row"><span className="rm-size-val-k">Dispatched</span><span className="rm-text--order">{fixed(r.dispatchedMt, 1)}</span></span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <button type="button" className="rm-link-btn" onClick={() => setOpen(true)} aria-haspopup="dialog">
            {rows.length} size{rows.length === 1 ? '' : 's'} · {fixed(data.totals.producedMt, 1)} MT produced · {fixed(data.totals.dispatchedMt, 1)} MT dispatched
          </button>
        </>
      )}
      {/* Mounted on open, so it starts on the period that has data. */}
      {open && <SizesDrawer open onClose={() => setOpen(false)} initial={rows.length ? 'selection' : 'last30'} />}
    </Panel>
  );
}
