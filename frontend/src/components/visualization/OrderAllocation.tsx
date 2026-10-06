import Panel from '@/components/Panel';
import OpenOrdersButton from '@/components/production/OpenOrdersButton';
import ProductionByOrderBlock from '@/components/production/ProductionByOrderBlock';
import FinishedStockBlock from '@/components/production/FinishedStockBlock';

/**
 * Production split by order linkage (all of it without order — the ERP does not link
 * production to orders) and finished stock (ERP stock ledger), both for the Duration
 * period. The open-orders button in the head is live.
 */
export default function OrderAllocation() {
  return (
    <Panel
      title="Order allocation"
      sub="Day production and period-end stock"
      right={<OpenOrdersButton />}
      className="rm-panel"
      bodyClass="rm-body rm-alloc"
    >
      {/* All production counts as without order: the ERP does not link production to orders. */}
      <ProductionByOrderBlock />

      {/* Live: ERP stock ledger to the end of the Duration period. */}
      <FinishedStockBlock />
    </Panel>
  );
}
