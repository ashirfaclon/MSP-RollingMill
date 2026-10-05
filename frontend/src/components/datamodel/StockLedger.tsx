import Panel from '@/components/Panel';
import { fixed } from '@/lib/num';
import { sum } from '@/models/millFlow';
import type { MillModel } from '@/models/millModel';
import CheckMark from './CheckMark';

/**
 * Warehouse stock by size over the window: what was there, what came in from the mill,
 * what was marked for an order (free → with order, no steel moves), what was dispatched,
 * and what is left. Each row is checked: the movements must reproduce the closing stock.
 */
export default function StockLedger({ m }: { m: MillModel }) {
  const { stock } = m;
  const ok = (size: string) => {
    const rows = stock.checks.filter((c) => c.id.startsWith(`stock.${size}.`));
    return rows.some((c) => c.ok === false) ? false : rows.some((c) => c.ok === null) ? null : true;
  };
  const col = (pick: (s: MillModel['stock']['sizes'][number]) => number | null) =>
    sum(...stock.sizes.map(pick));
  const n = (v: number | null) => fixed(v, 0);

  return (
    <Panel title="Stock ledger" sub="By size · MT · marked with order or free" className="rm-panel" bodyClass="dm-body">
      <div className="dm-scroll">
        <table className="grid dm-table dm-table--ledger" aria-label="Stock ledger by size">
          <thead>
            <tr>
              <th rowSpan={2}>Size</th>
              <th colSpan={2} className="c">Opening</th>
              <th colSpan={2} className="c">Received</th>
              <th rowSpan={2} className="r" title="Free stock marked for an order">Allocated</th>
              <th rowSpan={2} className="r">Dispatched</th>
              <th colSpan={2} className="c">Closing</th>
              <th rowSpan={2} className="c">Check</th>
            </tr>
            <tr>
              <th className="r">Order</th><th className="r">Free</th>
              <th className="r">Order</th><th className="r">Free</th>
              <th className="r">Order</th><th className="r">Free</th>
            </tr>
          </thead>
          <tbody>
            {stock.sizes.map((s) => {
              const v = ok(s.size);
              return (
                <tr key={s.size}>
                  <td><b>{s.size}</b></td>
                  <td className="num r">{n(s.opening.withOrder)}</td>
                  <td className="num r">{n(s.opening.free)}</td>
                  <td className="num r v-val">{n(s.received.withOrder)}</td>
                  <td className="num r v-val">{n(s.received.free)}</td>
                  <td className="num r v-info">{n(s.allocated)}</td>
                  <td className="num r v-val">{n(s.dispatched)}</td>
                  <td className="num r v-val dm-strong">{n(s.closing.withOrder)}</td>
                  <td className="num r v-val dm-strong">{n(s.closing.free)}</td>
                  <td className="c"><CheckMark ok={v} /></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td><b>Total</b></td>
              <td className="num r">{n(col((s) => s.opening.withOrder))}</td>
              <td className="num r">{n(col((s) => s.opening.free))}</td>
              <td className="num r v-val">{n(col((s) => s.received.withOrder))}</td>
              <td className="num r v-val">{n(col((s) => s.received.free))}</td>
              <td className="num r v-info">{n(stock.allocated)}</td>
              <td className="num r v-val">{n(stock.dispatched)}</td>
              <td className="num r v-val dm-strong">{n(stock.withOrder)}</td>
              <td className="num r v-val dm-strong">{n(stock.free)}</td>
              <td className="c"><CheckMark ok={stock.balanced} /></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="dm-foot">
        Order: opening + received + allocated − dispatched = closing. Free: opening + received − allocated = closing.
      </p>
    </Panel>
  );
}
