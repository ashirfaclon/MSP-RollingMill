'use client';

/**
 * "Made To Stock" (production without an order): the ERP does not link production to sales
 * orders, so all production counts as made to stock — the Production card's figure, 100 % of
 * output.
 */
import KpiCard from '@/components/visualization/KpiCard';
import { fixed } from '@/lib/num';
import { useProductionForSelection } from './useProductionForSelection';

export default function ProductionWithoutOrderCard() {
  const { mt, loading } = useProductionForSelection();
  return (
    <KpiCard
      label="Made To Stock"
      value={fixed(mt, 1)}
      unit="MT"
      note={mt === null ? 'No production data' : ''}
      series="free"
      meterPct={mt ? 100 : 0}
      loading={loading}
    />
  );
}
