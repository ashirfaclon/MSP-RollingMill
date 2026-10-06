import KpiCard from './KpiCard';
import ProductionKpiCard from '@/components/production/ProductionKpiCard';
import YieldKpiCard from '@/components/production/YieldKpiCard';
import ProductionWithoutOrderCard from '@/components/production/ProductionWithoutOrderCard';
import { fixed } from '@/lib/num';
import type { MillModel } from '@/models/millModel';

/** The seven headline figures, left to right as on the comp. Cards with no live source show 0. */
export default function KpiStrip({ m }: { m: MillModel }) {
  const k = m.kpis;
  return (
    <section className="rm-strip" aria-label="Headline KPIs">
      {/* Live from the ERP, for the Duration filter's period; opens the ERP-vs-Influx drawer. */}
      <ProductionKpiCard />
      {/* Live from the ERP log sheet: Σ production ÷ Σ billet input; opens the yield drawer. */}
      <YieldKpiCard />
      <KpiCard
        label="Power consumption"
        value={fixed(k.energyMwh, 2)}
        unit="MWh"
        note=""
        series="prod"
      />
      <KpiCard
        label="Specific energy"
        value={fixed(k.specificEnergyKwhPerMt, 1)}
        unit="kWh/MT"
        note=""
        series="prod"
      />
      {/* All production counts as without order: the ERP does not link production to orders. */}
      <ProductionWithoutOrderCard />
      <KpiCard
        label="Made For Order"
        value={fixed(m.stock.withOrder, 0)}
        unit="MT"
        note=""
        series="order"
        meterPct={m.stock.withOrderPct ?? undefined}
      />
      <KpiCard
        label="Made To Stock"
        value={fixed(m.stock.free, 0)}
        unit="MT"
        note=""
        series="free"
        meterPct={m.stock.freePct ?? undefined}
      />
    </section>
  );
}
