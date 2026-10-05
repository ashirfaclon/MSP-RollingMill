'use client';

/**
 * Strip produced and dispatched per size, from the ERP: stores receipts (PROD_TRAN) and
 * sale lines (SALE), both for finished-strip items, grouped by the width × thickness in
 * the item name. Dispatch can exceed production in a period — it ships from stock too.
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from './DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from './DrillChart';
import { useDrillRange, type RangeId } from './useDrillRange';
import { hhmm } from './CounterDrawer';
import { dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type SizeReport } from '@/services/hsmApi';

const TOP = 16;
const AXES = [{ title: 'MT', unit: 'MT' }];

export default function SizesDrawer(props: { open: boolean; onClose: () => void; initial?: RangeId }) {
  const r = useDrillRange(['last30', 'selection', 'since'], props.initial ?? 'last30', { grain: false });
  const url = props.open && r.dates ? rangeUrl('/api/hsm/sizes', r.dates) : null;
  const { data, dataUrl, loading, error } = useApi<SizeReport>(url);
  return (
    <DrillDrawer
      open={props.open}
      onClose={props.onClose}
      title="Production & dispatch by size"
      sub="HSM · Hot Strip Mill · ERP stores receipts and sale lines, MT"
      controls={r.controls}
      loading={loading}
      stale={!!data && dataUrl !== url}
      error={error}
      hasData={!!data}
    >
      {data && <Content data={data} />}
    </DrillDrawer>
  );
}

function Content({ data }: { data: SizeReport }) {
  const t = data.totals;
  const top = useMemo(() => data.rows.slice(0, TOP), [data.rows]);
  const categories = useMemo(() => top.map((r) => r.label), [top]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'produced', name: 'Produced (stores receipts)', token: '--s-prod', type: 'column', data: top.map((r) => r.producedMt || null), dp: 2 },
    { id: 'dispatched', name: 'Dispatched (sale lines)', token: '--s-order', type: 'column', data: top.map((r) => r.dispatchedMt || null), dp: 2 },
  ], [top]);
  const withOrderPct = t.dispatchedMt ? (t.dispatchedWithOrderMt / t.dispatchedMt) * 100 : null;

  return (
    <>
      <Stats items={[
        { label: 'Produced', value: fmtNum(t.producedMt, 2), unit: 'MT' },
        { label: 'Dispatched', value: fmtNum(t.dispatchedMt, 2), unit: 'MT' },
        { label: 'Dispatched on an order', value: fmtNum(withOrderPct, 1), unit: '%', title: `${fmtNum(t.dispatchedWithOrderMt, 2)} MT` },
        { label: 'Sizes', value: String(data.rows.length) },
      ]} />
      {data.rows.length === 0 ? (
        <p className="pd-empty">No strip received or dispatched in this period — ERP receipts entered up to {dm(data.erp.lastDate)}.</p>
      ) : (
        <DrillChart
          series={series}
          categories={categories}
          axes={AXES}
          horizontal
          height={Math.max(260, top.length * 30 + 60)}
          ariaLabel={`Top ${top.length} sizes: ${top.map((r) => `${r.label} produced ${fmtNum(r.producedMt, 1)}, dispatched ${fmtNum(r.dispatchedMt, 1)}`).join('; ')}`}
        />
      )}
      {data.rows.length > TOP && <p className="pd-dim">Chart shows the {TOP} largest sizes; the table lists all {data.rows.length}.</p>}

      <div className="pd-table-wrap pd-table-wrap--tall">
        <table className="grid pd-table" aria-label="Production and dispatch by size">
          <thead>
            <tr><th>Size (width × thickness, mm)</th><th className="r">Produced (MT)</th><th className="r">Dispatched (MT)</th><th className="r">On an order (MT)</th><th>ERP items</th></tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.key}>
                <td><b>{r.label}</b></td>
                <td className="num r v-val">{fmtNum(r.producedMt, 2)}</td>
                <td className="num r v-val">{fmtNum(r.dispatchedMt, 2)}</td>
                <td className="num r">{fmtNum(r.dispatchedWithOrderMt, 2)}</td>
                <td className="pd-dim" title={r.items.map((i) => `${i.code} · ${i.name}`).join('\n')}>{r.items.map((i) => i.code).join(', ')}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td><b>Total strip</b></td><td className="num r">{fmtNum(t.producedMt, 2)}</td><td className="num r">{fmtNum(t.dispatchedMt, 2)}</td><td className="num r">{fmtNum(t.dispatchedWithOrderMt, 2)}</td><td /></tr>
          </tfoot>
        </table>
      </div>

      {data.byProducts.length > 0 && (
        <div className="pd-table-wrap">
          <table className="grid pd-table" aria-label="By-products received">
            <thead><tr><th>By-product received (not strip)</th><th className="r">MT</th></tr></thead>
            <tbody>{data.byProducts.map((b) => <tr key={b.code}><td>{b.name} <span className="pd-dim">· {b.code}</span></td><td className="num r">{fmtNum(b.mt, 2)}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      <ul className="pd-notes">
        <li><b>Produced</b> — finished strip received into stores (PROD_TRAN receipts of finished-strip items, strip mill division S1). It is checked day by day against the log-sheet production in the Quality &amp; stores view of the Material balance panel.</li>
        <li><b>Dispatched</b> — sale-invoice lines (SALE) for the same items, from the finished-goods yard. <b>On an order</b> = the line names the sales order it was billed against.</li>
        <li><b>Size</b> is read from the ERP item name (e.g. &quot;MS STRIP (274 - 276 X 2.50) MM&quot;); the plain and &quot;Direct&quot; items of one size are one row, defective strip is its own row.</li>
        <li>Synced {hhmm(data.erp.syncedAt)}; receipts entered up to <b>{dm(data.erp.lastDate)}</b>. Stock per size is not shown: the ERP has no opening balance for this year, so a closing stock cannot be computed.</li>
        {data.erp.connection === 'down' && <li className="v-warn">{data.erp.message}</li>}
      </ul>
    </>
  );
}
