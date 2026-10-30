'use client';

/**
 * Production in the Order allocation panel: the ERP log sheet's production (PRODUCTION_MT,
 * series L6P) for the Duration period — ERP only, never the Influx counter (the user, 30 Oct
 * 2026) — with the days it covers. The ERP does not link production to sales orders, so none
 * of it is split as made to order.
 */
import { fixed } from '@/lib/num';
import { useProduction, useSelection } from '@/services/hsmProduction';
import { ProductionTerm } from './productionTerm';

export default function ProductionByOrderBlock() {
  const { dates } = useSelection();
  const { data, loading, error } = useProduction(dates ? { ...dates, grain: 'day' } : null);
  const now = data && dates && data.from === dates.from && data.to === dates.to ? data : null;
  const mt = now?.totals.erpMt ?? null;
  return (
    <div className="rm-alloc-block">
      <div className="rm-alloc-head">
        <span className="rm-k">Production{now && mt !== null && <ProductionTerm from={now.from} to={now.to} lastDate={now.erp.lastDate} />}</span>
        <span className={`rm-alloc-total num ${mt === null && !loading ? 'v-na' : 'v-val'}`}>
          {!now && loading && !error ? <span className="skel skel--num" role="status" aria-label="Loading" /> : mt === null ? 'NA' : `${fixed(mt, 1)} MT`}
        </span>
      </div>
    </div>
  );
}
