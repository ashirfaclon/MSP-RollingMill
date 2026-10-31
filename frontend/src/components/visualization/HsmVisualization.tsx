/**
 * HSM · Visualization: KPI strip, Production by shift and Finished stock by size, the material
 * balance across the page, the checklists and the mill mimic at the bottom. Every figure is live
 * (ERP, logbook, historian) or NA — no sample figures (the sample model was removed, 31 Oct 2026).
 */
import KpiStrip from './KpiStrip';
import MillMimic from './MillMimic';
import ShiftProduction from './ShiftProduction';
import MaterialBalance from './MaterialBalance';
import StockBySize from './StockBySize';
import ChecklistButton from '@/components/checklist/HsmChecklists';
import './visualization.css';

export default function HsmVisualization() {
  return (
    <div className="rm-viz">
      <KpiStrip />
      {/* No Order allocation panel: production's period is on the Production card, finished stock is
          its own card (the user, 31 Oct 2026). Stock by size takes its place; the balance gets the full width. */}
      <div className="rm-row">
        {/* Each checklist in the panel its content belongs to (the user, 31 Oct 2026). */}
        <ShiftProduction actions={<ChecklistButton kind="variance" />} />
        <StockBySize />
      </div>
      <div className="rm-row rm-row--full">
        <MaterialBalance />
      </div>
      {/* The mill mimic sits at the bottom of every page that has one (the user, 30 Oct 2026). */}
      <MillMimic actions={<ChecklistButton kind="setup" />} />
    </div>
  );
}
