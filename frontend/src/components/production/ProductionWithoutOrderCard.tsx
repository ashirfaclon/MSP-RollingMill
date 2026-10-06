'use client';

/**
 * "Production without order": the ERP does not link production to sales orders, so all
 * production counts as without order — the Production card's figure, 100 % of output.
 */
import KpiCard from '@/components/visualization/KpiCard';
import { fixed } from '@/lib/num';
import { useProductionForSelection } from './useProductionForSelection';

export default function ProductionWithoutOrderCard() {
  const { mt, loading } = useProductionForSelection();
  return (
    <KpiCard
      label="Production without order"
      value={fixed(mt, 1)}
      unit="MT"
      note={mt === null ? 'No production data' : '100% of production · no order link in ERP'}
      series="free"
      meterPct={mt ? 100 : 0}
      loading={loading}
    />
  );
}
