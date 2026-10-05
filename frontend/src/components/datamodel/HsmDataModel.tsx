/**
 * HSM · Data Model — the ledgers behind every Visualization KPI, laid out so a reader can
 * follow a number back to where it came from and see whether it balances.
 */
import MaterialFlow from '@/components/visualization/MaterialFlow';
import { HSM_SAMPLE } from '@/components/visualization/hsmSample';
import { resolveMill } from '@/models/millModel';
import ShiftLedger from './ShiftLedger';
import RunTimePanel from './RunTimePanel';
import StockLedger from './StockLedger';
import OrdersPanel from './OrdersPanel';
import ModelChecks from './ModelChecks';
import '@/components/visualization/visualization.css';
import './datamodel.css';

export default function HsmDataModel() {
  const m = resolveMill(HSM_SAMPLE);
  return (
    <div className="rm-viz dm">
      <MaterialFlow flow={m.flow} />
      <div className="dm-row">
        <ShiftLedger m={m} />
        <RunTimePanel m={m} />
      </div>
      <div className="dm-row">
        <StockLedger m={m} />
        <OrdersPanel m={m} />
      </div>
      <ModelChecks m={m} />
    </div>
  );
}
