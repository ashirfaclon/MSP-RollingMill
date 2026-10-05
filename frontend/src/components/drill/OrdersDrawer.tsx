'use client';

/**
 * Sales orders for strip, from the ERP (SORD, latest amendment of each line). Two
 * questions, kept apart because they count different things:
 *   – orders PLACED in the period: ordered vs executed per day / week / month;
 *   – the open book TODAY: every line with quantity still pending, by age and client.
 */
import { useMemo, useState } from 'react';
import DrillDrawer, { Stats } from './DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from './DrillChart';
import { useDrillRange } from './useDrillRange';
import { hhmm } from './CounterDrawer';
import { dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type OrdersReport } from '@/services/hsmApi';

const AXES = [{ title: 'MT', unit: 'MT' }];
const PAGE = 60;

export default function OrdersDrawer(props: { open: boolean; onClose: () => void }) {
  const r = useDrillRange(['last30', 'selection', 'since'], 'last30');
  const url = props.open && r.dates ? rangeUrl('/api/hsm/orders', { ...r.dates, grain: r.grain }) : null;
  const { data, dataUrl, loading, error } = useApi<OrdersReport>(url);
  return (
    <DrillDrawer
      open={props.open}
      onClose={props.onClose}
      title="Sales orders · strip"
      sub="HSM · Hot Strip Mill · ERP sales orders, MT"
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

function Content({ data }: { data: OrdersReport }) {
  const [all, setAll] = useState(false);
  const t = data.totals;
  const o = data.open;
  const rows = data.rows;
  const categories = useMemo(() => rows.map((r) => r.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'ordered', name: 'Ordered', token: '--s-prod', type: 'column', data: rows.map((r) => r.orderedMt), dp: 2 },
    { id: 'executed', name: 'Executed (dispatched)', token: '--s-order', type: 'column', data: rows.map((r) => r.executedMt), dp: 2 },
    { id: 'pending', name: 'Still pending', token: '--s-free', type: 'line', data: rows.map((r) => r.pendingMt), dp: 2 },
  ], [rows]);
  const maxAge = Math.max(...o.ages.map((a) => a.pendingMt), 1);
  const list = all ? o.list : o.list.slice(0, PAGE);

  return (
    <>
      <h3 className="pd-h">Orders placed in the period</h3>
      <Stats items={[
        { label: 'Ordered', value: fmtNum(t.orderedMt, 2), unit: `MT · ${t.lines} lines` },
        { label: 'Executed', value: fmtNum(t.executedMt, 2), unit: `MT${t.orderedMt ? ` · ${fmtNum((t.executedMt / t.orderedMt) * 100, 1)}%` : ''}` },
        { label: 'Cancelled', value: fmtNum(t.cancelledMt, 2), unit: 'MT' },
        { label: 'Still pending', value: fmtNum(t.pendingMt, 2), unit: 'MT', tone: t.pendingMt > 0 ? 'v-warn' : 'v-ok' },
      ]} />
      <DrillChart
        series={series}
        categories={categories}
        axes={AXES}
        ariaLabel={`Orders per period: ${rows.map((r) => `${r.label} ordered ${fmtNum(r.orderedMt, 1)}, executed ${fmtNum(r.executedMt, 1)}`).join('; ')}`}
      />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Orders placed by period">
          <thead><tr><th>Order date</th><th className="r">Lines</th><th className="r">Ordered</th><th className="r">Executed</th><th className="r">Cancelled</th><th className="r">Pending</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td><b>{r.label}</b>{r.fromDate !== r.toDate && <span className="pd-dim"> · {dm(r.fromDate)}–{dm(r.toDate)}</span>}</td>
                <td className="num r">{r.lines}</td>
                <td className="num r v-val">{fmtNum(r.orderedMt, 2)}</td>
                <td className="num r v-val">{fmtNum(r.executedMt, 2)}</td>
                <td className="num r">{fmtNum(r.cancelledMt, 2)}</td>
                <td className="num r v-val">{fmtNum(r.pendingMt, 2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td><b>Total</b></td><td className="num r">{t.lines}</td><td className="num r">{fmtNum(t.orderedMt, 2)}</td><td className="num r">{fmtNum(t.executedMt, 2)}</td><td className="num r">{fmtNum(t.cancelledMt, 2)}</td><td className="num r">{fmtNum(t.pendingMt, 2)}</td></tr></tfoot>
        </table>
      </div>

      <h3 className="pd-h">Open order book · as of {dm(data.asOf)}</h3>
      <Stats items={[
        { label: 'Open lines', value: String(o.lines) },
        { label: 'Pending', value: fmtNum(o.pendingMt, 2), unit: 'MT' },
        { label: 'Past due date', value: fmtNum(o.overdueMt, 2), unit: `MT · ${o.overdueLines} lines`, tone: o.overdueLines ? 'v-warn' : 'v-ok' },
        { label: 'Clients', value: String(o.byClient.length) },
      ]} />
      <div className="pd-split">
        <ul className="pd-bars" aria-label="Pending by order age">
          {o.ages.map((a) => (
            <li key={a.label}>
              <span className="pd-bars-k">{a.label}</span>
              <span className="pd-bars-track"><i style={{ width: `${(a.pendingMt / maxAge) * 100}%` }} /></span>
              <span className="num v-val">{fmtNum(a.pendingMt, 1)} MT</span>
              <span className="pd-dim num">{a.lines} lines</span>
            </li>
          ))}
        </ul>
        <table className="grid pd-table" aria-label="Pending by client">
          <thead><tr><th>Client</th><th className="r">Lines</th><th className="r">Pending (MT)</th></tr></thead>
          <tbody>{o.byClient.map((c) => <tr key={c.client}><td>{c.client}</td><td className="num r">{c.lines}</td><td className="num r v-val">{fmtNum(c.pendingMt, 2)}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="pd-table-wrap pd-table-wrap--tall">
        <table className="grid pd-table" aria-label="Open order lines">
          <thead><tr><th>Order · line</th><th>Order date</th><th>Client</th><th>Size</th><th className="r">Ordered</th><th className="r">Executed</th><th className="r">Pending</th><th className="r">Age (d)</th><th>Due</th></tr></thead>
          <tbody>
            {list.map((l) => (
              <tr key={`${l.orderNo}-${l.line}`}>
                <td className="num">{l.orderNo} · {l.line}</td>
                <td>{dm(l.date)}</td>
                <td className="pd-clip" title={l.client}>{l.client}</td>
                <td>{l.size}</td>
                <td className="num r">{fmtNum(l.qtyMt, 2)}</td>
                <td className="num r">{fmtNum(l.executedMt, 2)}</td>
                <td className="num r v-val">{fmtNum(l.pendingMt, 2)}</td>
                <td className="num r">{l.ageDays}</td>
                <td className={l.overdue ? 'v-warn' : undefined}>{l.due ? dm(l.due) : '—'}{l.overdue ? ' · past due' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {o.list.length > PAGE && (
        <button type="button" className="pd-more" onClick={() => setAll(!all)}>
          {all ? `Show the oldest ${PAGE} only` : `Show all ${o.list.length} open lines`}
        </button>
      )}

      <ul className="pd-notes">
        <li><b>Source</b> — ERP sales orders (ORDER_HEAD / ORDER_BODY, type SORD) for finished-strip items, synced {hhmm(data.erp.syncedAt)}; latest order dated <b>{dm(data.erp.lastDate)}</b>. An amended line is counted once, at its latest amendment.</li>
        <li><b>Pending</b> = ordered − executed − cancelled, per line. <b>Age</b> = days since the order date. An old line with quantity pending is open in the ERP — it may have been abandoned without being closed there.</li>
        {data.erp.connection === 'down' && <li className="v-warn">{data.erp.message}</li>}
      </ul>
    </>
  );
}
