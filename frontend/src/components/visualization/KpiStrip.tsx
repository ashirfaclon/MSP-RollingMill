import KpiCard from './KpiCard';
import ProductionKpiCard from '@/components/production/ProductionKpiCard';
import YieldKpiCard from '@/components/production/YieldKpiCard';
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
        note="Metered energy · day"
        series="prod"
      />
      <KpiCard
        label="Specific energy"
        value={fixed(k.specificEnergyKwhPerMt, 1)}
        unit="kWh/MT"
        note="Energy per finished MT"
        series="prod"
      />
      <KpiCard
        label="Production without order"
        value={fixed(k.productionFreeMt, 1)}
        unit="MT"
        note={`${fixed(k.productionFreePct, 1)}% of day output`}
        series="free"
        meterPct={k.productionFreePct ?? undefined}
      />
      <KpiCard
        label="Stock with order"
        value={fixed(m.stock.withOrder, 0)}
        unit="MT"
        note={`${fixed(m.stock.withOrderPct, 1)}% of finished stock`}
        series="order"
        meterPct={m.stock.withOrderPct ?? undefined}
      />
      <KpiCard
        label="Free stock"
        value={fixed(m.stock.free, 0)}
        unit="MT"
        note={`${fixed(m.stock.freePct, 1)}% of finished stock`}
        series="free"
        meterPct={m.stock.freePct ?? undefined}
      />
    </section>
  );
}
