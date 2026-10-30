/**
 * HSM · Visualization. Layout follows the approved comp: KPI strip, mill mimic, then two
 * rows of paired panels.
 *
 * Live (ERP / plant historian, each opening a drill-down): Production and Mass yield
 * cards, the mill mimic, running rate, material balance, production & dispatch by size,
 * open orders.
 * Everything else has no live source yet and shows 0 (`withoutSampleFigures`).
 */
import KpiStrip from './KpiStrip';
import MillMimic from './MillMimic';
import ShiftProduction from './ShiftProduction';
import OrderAllocation from './OrderAllocation';
import MaterialBalance from './MaterialBalance';
import StockBySize from './StockBySize';
import { HSM_SAMPLE } from './hsmSample';
import { resolveMill, type MillModel } from '@/models/millModel';
import HsmChecklists from '@/components/checklist/HsmChecklists';
import './visualization.css';

/**
 * Figures with no live source yet show 0, not the sample model's numbers: power, specific
 * energy, stock with order / free stock, and production by shift
 * (plan, output, plan gap). Each goes live when its source is confirmed. Running rate is
 * calculated live in its own component.
 */
function withoutSampleFigures(m: MillModel): MillModel {
  return {
    ...m,
    kpis: {
      ...m.kpis,
      energyMwh: 0, specificEnergyKwhPerMt: 0,
      planMt: 0, planGapMt: 0,
    },
    stock: { ...m.stock, withOrder: 0, withOrderPct: 0, free: 0, freePct: 0 },
    shifts: m.shifts.map((sh) => ({ ...sh, planMt: 0, output: { ...sh.output, mt: 0 } })),
  };
}

export default function HsmVisualization() {
  const m = withoutSampleFigures(resolveMill(HSM_SAMPLE));
  return (
    <div className="rm-viz">
      <KpiStrip m={m} />
      <div className="rm-row">
        <ShiftProduction m={m} />
        <OrderAllocation />
      </div>
      <div className="rm-row">
        <MaterialBalance />
        <StockBySize />
      </div>
      <HsmChecklists />
      {/* The mill mimic sits at the bottom of every page that has one (the user, 30 Oct 2026). */}
      <MillMimic />
    </div>
  );
}
