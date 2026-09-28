import Panel from '@/components/Panel';
import StackBar from './StackBar';
import LegendItem from './Legend';
import { fixed } from '@/lib/num';
import type { HsmValues } from './hsmValues';

/** Finished stock per product size, split with-order / free, on one shared scale. */
export default function StockBySize({ v }: { v: HsmValues }) {
  const max = Math.max(...v.stockBySize.map((r) => r.withOrder + r.free));
  return (
    <Panel
      title="Finished stock by size"
      right={
        <span className="rm-legend rm-legend--head">
          <LegendItem series="order" label="With order" />
          <LegendItem series="free" label="Free stock" />
        </span>
      }
      className="rm-panel"
      bodyClass="rm-body"
    >
      <ul className="rm-sizes">
        {v.stockBySize.map((r) => {
          const total = r.withOrder + r.free;
          return (
            <li className="rm-size" key={r.size}>
              <span className="rm-size-name">{r.size}</span>
              <StackBar
                size="sm"
                max={max}
                label={`${r.size}: ${fixed(total, 0)} MT — with order ${fixed(r.withOrder, 0)} MT, free ${fixed(r.free, 0)} MT`}
                parts={[
                  { label: 'With order', value: r.withOrder, series: 'order' },
                  { label: 'Free', value: r.free, series: 'free' },
                ]}
              />
              <span className="rm-size-val num v-val">{fixed(total, 0)} MT</span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
