import Panel from '@/components/Panel';
import OpenOrdersButton from '@/components/production/OpenOrdersButton';
import ProductionByOrderBlock from '@/components/production/ProductionByOrderBlock';
import FinishedStockBlock from '@/components/production/FinishedStockBlock';

/**
 * Production split Made To Order / Made To Stock (all of it made to stock — the ERP does not link
 * production to orders) and finished stock (ERP stock ledger), both for the Duration
 * period. The open-orders button in the head is live.
 */
export default function OrderAllocation() {
  return (
    <Panel
      title="Order allocation"
      right={<OpenOrdersButton />}
      className="rm-panel"
      bodyClass="rm-body rm-alloc"
    >
      {/* All production counts as Made To Stock: the ERP does not link production to orders. */}
      <ProductionByOrderBlock />

      {/* Live: ERP stock ledger to the end of the Duration period. */}
      <FinishedStockBlock />
    </Panel>
  );
}
