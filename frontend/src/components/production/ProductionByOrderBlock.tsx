'use client';

/**
 * Production split by order linkage, in the Order allocation panel. The ERP does not link
 * production to sales orders, so none of it can be shown as made against an order: all of
 * it counts as without order. The total is the Production card's figure (Influx counter,
 * reset events less noise, for the Duration period), so the two always agree.
 */
import StackBar from '@/components/visualization/StackBar';
import LegendItem from '@/components/visualization/Legend';
import { fixed } from '@/lib/num';
import { useProductionForSelection } from './useProductionForSelection';

export default function ProductionByOrderBlock() {
  const { mt, loading } = useProductionForSelection();
  const total = mt ?? 0;
  return (
    <div className="rm-alloc-block">
      <div className="rm-alloc-head">
        <span className="rm-k">Production</span>
        <span className="rm-alloc-total num v-val">
          {loading ? <span className="skel skel--num" role="status" aria-label="Loading" /> : `${fixed(mt, 1)} MT`}
        </span>
      </div>
      <StackBar
        label={`Production ${fixed(mt, 1)} MT: with order 0.0 MT, without order ${fixed(mt, 1)} MT`}
        parts={[
          { label: 'Against order', value: 0, series: 'order' },
          { label: 'Without order', value: total, series: 'free' },
        ]}
      />
      <div className="rm-legend">
        <LegendItem series="order" label="Against order" value="0.0 MT" />
        <LegendItem series="free" label="Without order" value={`${fixed(mt, 1)} MT`} />
      </div>
    </div>
  );
}
