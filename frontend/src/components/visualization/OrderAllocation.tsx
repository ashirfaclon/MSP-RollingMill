import Panel from '@/components/Panel';
import StackBar from './StackBar';
import LegendItem from './Legend';
import { fixed } from '@/lib/num';
import type { HsmDerived, HsmValues } from './hsmValues';

/** Day production and period-end finished stock, each split by order linkage. */
export default function OrderAllocation({ v, d }: { v: HsmValues; d: HsmDerived }) {
  return (
    <Panel
      title="Order allocation"
      sub="Day production and period-end stock"
      right={<span className="chip chip--na">ERP</span>}
      className="rm-panel"
      bodyClass="rm-body rm-alloc"
    >
      <div className="rm-alloc-block">
        <div className="rm-alloc-head">
          <span className="rm-k">Production</span>
          <span className="rm-alloc-total num v-val">{fixed(v.production, 1)} MT</span>
        </div>
        <StackBar
          label={`Production ${fixed(v.production, 1)} MT: against order ${fixed(v.productionAgainstOrder, 1)} MT, without order ${fixed(v.productionWithoutOrder, 1)} MT`}
          parts={[
            { label: 'Against order', value: v.productionAgainstOrder, series: 'order' },
            { label: 'Without order', value: v.productionWithoutOrder, series: 'free' },
          ]}
        />
        <div className="rm-legend">
          <LegendItem series="order" label="Against order" value={`${fixed(v.productionAgainstOrder, 1)} MT`} />
          <LegendItem series="free" label="Without order" value={`${fixed(v.productionWithoutOrder, 1)} MT`} />
        </div>
      </div>

      <div className="rm-alloc-block">
        <div className="rm-alloc-head">
          <span className="rm-k">Finished stock</span>
          <span className="rm-alloc-total num v-val">{fixed(d.stockTotal, 0)} MT</span>
        </div>
        <StackBar
          label={`Finished stock ${fixed(d.stockTotal, 0)} MT: with order ${fixed(d.stockWithOrder, 0)} MT, free ${fixed(d.stockFree, 0)} MT`}
          parts={[
            { label: 'With order', value: d.stockWithOrder, series: 'order' },
            { label: 'Free', value: d.stockFree, series: 'free' },
          ]}
        />
        <div className="rm-legend">
          <LegendItem series="order" label="With order" value={`${fixed(d.stockWithOrder, 0)} MT`} />
          <LegendItem series="free" label="Free" value={`${fixed(d.stockFree, 0)} MT`} />
          <span className="rm-legend-end">
            <b className="num v-val">{fixed(v.orderCoverPct, 1)}%</b> <span className="rm-k">order cover</span>
          </span>
        </div>
      </div>
    </Panel>
  );
}
