import KpiCard from './KpiCard';
import { fixed } from '@/lib/num';
import type { HsmDerived, HsmValues } from './hsmValues';

/** The seven headline figures, left to right as on the comp. */
export default function KpiStrip({ v, d }: { v: HsmValues; d: HsmDerived }) {
  return (
    <section className="rm-strip" aria-label="Headline KPIs">
      <KpiCard
        label="Production"
        value={fixed(v.production, 1)}
        unit="MT"
        note={`${fixed(d.planPct, 0)}% plan · ${fixed(d.runRateTph, 2)} TPH`}
        series="prod"
        meterPct={d.planPct}
      />
      <KpiCard
        label="Mass yield"
        value={fixed(d.yieldPct, 1)}
        unit="%"
        note={`${fixed(v.production, 1)} ÷ ${fixed(v.billetInput, 1)} MT`}
        series="order"
        meterPct={d.yieldPct}
      />
      <KpiCard
        label="Power consumption"
        value={fixed(v.powerMwh, 2)}
        unit="MWh"
        note="Metered energy · day"
        series="prod"
      />
      <KpiCard
        label="Specific energy"
        value={fixed(d.specificEnergy, 1)}
        unit="kWh/MT"
        note="Energy per finished MT"
        series="prod"
      />
      <KpiCard
        label="Production without order"
        value={fixed(v.productionWithoutOrder, 1)}
        unit="MT"
        note={`${fixed(d.withoutOrderPct, 1)}% of day output`}
        series="free"
        meterPct={d.withoutOrderPct}
      />
      <KpiCard
        label="Stock with order"
        value={fixed(d.stockWithOrder, 0)}
        unit="MT"
        note={`${fixed(d.stockWithOrderPct, 1)}% of finished stock`}
        series="order"
        meterPct={d.stockWithOrderPct}
      />
      <KpiCard
        label="Free stock"
        value={fixed(d.stockFree, 0)}
        unit="MT"
        note={`${fixed(d.stockFreePct, 1)}% of finished stock`}
        series="free"
        meterPct={d.stockFreePct}
      />
    </section>
  );
}
