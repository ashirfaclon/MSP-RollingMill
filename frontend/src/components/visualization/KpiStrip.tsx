import ProductionKpiCard from '@/components/production/ProductionKpiCard';
import YieldKpiCard from '@/components/production/YieldKpiCard';
import PowerKpiCard from '@/components/production/PowerKpiCard';
import SpecificEnergyCard from '@/components/production/SpecificEnergyCard';
import type { MillModel } from '@/models/millModel';

/**
 * The headline figures, left to right as on the comp. No Made To Order / Made To Stock and no Stock
 * with order / Free stock cards: the order split is dropped on every mill (the user, 27 Oct 2026).
 */
export default function KpiStrip(_: { m: MillModel }) {
  return (
    <section className="rm-strip rm-strip--four" aria-label="Headline KPIs">
      {/* Live from the ERP, for the Duration filter's period; opens the ERP-vs-Influx drawer. */}
      <ProductionKpiCard />
      {/* Live from the ERP log sheet: Σ production ÷ Σ billet input; opens the yield drawer. */}
      <YieldKpiCard />
      {/* Live: Σ power-consumed of the logbook form Electrical HSM → Power Consumption, by the form's date. */}
      <PowerKpiCard />
      {/* Live: logbook power ÷ the Production card's Total (Influx), kWh/MT. */}
      <SpecificEnergyCard />
    </section>
  );
}
