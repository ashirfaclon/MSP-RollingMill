/**
 * HSM · Visualization. Layout follows the approved comp: KPI strip, mill mimic, then two
 * rows of paired panels. Figures come from `hsmValues.ts` (static for now).
 */
import KpiStrip from './KpiStrip';
import MillMimic from './MillMimic';
import ShiftProduction from './ShiftProduction';
import OrderAllocation from './OrderAllocation';
import MaterialBalance from './MaterialBalance';
import StockBySize from './StockBySize';
import { HSM_VALUES, deriveHsm } from './hsmValues';
import './visualization.css';

export default function HsmVisualization() {
  const v = HSM_VALUES;
  const d = deriveHsm(v);
  return (
    <div className="rm-viz">
      <KpiStrip v={v} d={d} />
      <MillMimic v={v} />
      <div className="rm-row">
        <ShiftProduction v={v} d={d} />
        <OrderAllocation v={v} d={d} />
      </div>
      <div className="rm-row">
        <MaterialBalance v={v} d={d} />
        <StockBySize v={v} />
      </div>
    </div>
  );
}
