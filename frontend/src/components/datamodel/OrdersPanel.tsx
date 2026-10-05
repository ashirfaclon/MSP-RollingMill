import Panel from '@/components/Panel';
import StackBar from '@/components/visualization/StackBar';
import LegendItem from '@/components/visualization/Legend';
import { fixed } from '@/lib/num';
import type { MillModel } from '@/models/millModel';

/**
 * Order fulfilment: each order is covered first from free stock marked against it, and
 * the rest is produced with order. Produced material waits in the warehouse before it
 * ships, so dispatched can trail both.
 */
export default function OrdersPanel({ m }: { m: MillModel }) {
  const n = (v: number) => fixed(v, 0);
  return (
    <Panel
      title="Orders"
      sub="Covered from stock, then produced · MT"
      right={
        <span className="rm-legend rm-legend--head">
          <LegendItem series="free" label="From stock" />
          <LegendItem series="order" label="Produced" />
          <LegendItem series="loss" label="To produce" />
        </span>
      }
      className="rm-panel"
      bodyClass="dm-body"
    >
      <div className="dm-scroll">
        <table className="grid dm-table" aria-label="Orders">
          <thead>
            <tr>
              <th>Order</th>
              <th className="r">Qty</th>
              <th className="r">From stock</th>
              <th className="r">Produced</th>
              <th className="r">To produce</th>
              <th className="r">Dispatched</th>
              <th className="r" title="Covered but not yet dispatched">In warehouse</th>
              <th className="dm-cover-col">Cover</th>
            </tr>
          </thead>
          <tbody>
            {m.orders.orders.map((o) => (
              <tr key={o.id}>
                <td><b>{o.id}</b> <span className="dm-sub dm-sub-line">{o.size}</span></td>
                <td className="num r v-val dm-strong">{n(o.qtyMt)}</td>
                <td className="num r v-val">{n(o.fromStockMt)}</td>
                <td className="num r v-val">{n(o.producedMt)}</td>
                <td className={`num r ${o.toProduceMt > 0 ? 'v-warn' : 'v-ok'}`}>{n(o.toProduceMt)}</td>
                <td className="num r v-val">{n(o.dispatchedMt)}</td>
                <td className="num r v-val">{n(o.awaitingDispatchMt)}</td>
                <td className="dm-cover-col">
                  <StackBar
                    size="sm"
                    max={o.qtyMt}
                    label={`${o.id}: ${n(o.fromStockMt)} MT from stock, ${n(o.producedMt)} MT produced, ${n(Math.max(0, o.toProduceMt))} MT to produce`}
                    parts={[
                      { label: 'From stock', value: o.fromStockMt, series: 'free' },
                      { label: 'Produced', value: o.producedMt, series: 'order' },
                      { label: 'To produce', value: Math.max(0, o.toProduceMt), series: 'loss' },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
