import Panel from '@/components/Panel';
import StackBar from './StackBar';
import LegendItem from './Legend';
import OpenOrdersButton from '@/components/production/OpenOrdersButton';
import FinishedStockBlock from '@/components/production/FinishedStockBlock';
import { fixed } from '@/lib/num';
import type { MillModel } from '@/models/millModel';

/**
 * Day production split by order linkage (no live source — the ERP does not link
 * production to orders — so 0), and finished stock (live from the ERP stock ledger). The
 * open-orders button in the head is live.
 */
export default function OrderAllocation({ m }: { m: MillModel }) {
  const k = m.kpis;
  return (
    <Panel
      title="Order allocation"
      sub="Day production and period-end stock"
      right={<OpenOrdersButton />}
      className="rm-panel"
      bodyClass="rm-body rm-alloc"
    >
      {/* No live source: the ERP does not link production to orders — shows 0. */}
      <div className="rm-alloc-block">
        <div className="rm-alloc-head">
          <span className="rm-k">Production</span>
          <span className="rm-alloc-total num v-val">{fixed(k.productionMt, 1)} MT</span>
        </div>
        <StackBar
          label={`Production ${fixed(k.productionMt, 1)} MT: with order ${fixed(k.productionWithOrderMt, 1)} MT, without order ${fixed(k.productionFreeMt, 1)} MT`}
          parts={[
            { label: 'Against order', value: k.productionWithOrderMt ?? 0, series: 'order' },
            { label: 'Without order', value: k.productionFreeMt ?? 0, series: 'free' },
          ]}
        />
        <div className="rm-legend">
          <LegendItem series="order" label="Against order" value={`${fixed(k.productionWithOrderMt, 1)} MT`} />
          <LegendItem series="free" label="Without order" value={`${fixed(k.productionFreeMt, 1)} MT`} />
        </div>
      </div>

      {/* Live: ERP stock ledger to the end of the Duration period. */}
      <FinishedStockBlock />
    </Panel>
  );
}
