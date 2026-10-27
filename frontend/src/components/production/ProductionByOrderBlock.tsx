'use client';

/**
 * Production split by order linkage, in the Order allocation panel: Made To Order (with an
 * order) and Made To Stock (without). The ERP does not link production to sales orders, so
 * none of it can be shown as made to order: all of it counts as made to stock. The total is the Production card's figure (Influx counter,
 * reset events less noise, for the Duration period), so the two always agree.
 */
import { fixed } from '@/lib/num';
import { useProductionForSelection } from './useProductionForSelection';

export default function ProductionByOrderBlock() {
  const { mt, loading } = useProductionForSelection();
  return (
    <div className="rm-alloc-block">
      <div className="rm-alloc-head">
        <span className="rm-k">Production</span>
        <span className="rm-alloc-total num v-val">
          {loading ? <span className="skel skel--num" role="status" aria-label="Loading" /> : `${fixed(mt, 1)} MT`}
        </span>
      </div>
    </div>
  );
}
