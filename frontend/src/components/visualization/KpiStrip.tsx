'use client';

import ProductionKpiCard from '@/components/production/ProductionKpiCard';
import YieldKpiCard from '@/components/production/YieldKpiCard';
import PowerKpiCard from '@/components/production/PowerKpiCard';
import SpecificEnergyCard from '@/components/production/SpecificEnergyCard';
import HsmHeaterPowerCards from '@/components/production/HsmHeaterPowerCards';
import FinishedStockCard from '@/components/production/FinishedStockCard';
import HsmRollingCards from './HsmRollingCards';
import { useGlobalSel } from '@/state/globalSel';

/**
 * The headline figures, left to right as on the comp. No Made To Order / Made To Stock and no Stock
 * with order / Free stock cards: the order split is dropped on every mill (the user, 27 Oct 2026).
 * After the five, the plant's management KPIs for the Rolling chosen in the top bar (HsmRollingCards; the
 * user, 23 Nov 2026) — six per row, as RMD and LSM. Both: the five and the seven, twelve in two rows.
 * Online or Offline: that rolling's cards alone, one row (Online seven, Offline six) — the five are for
 * both rollings together and are not shown (the user, 24 Nov 2026). Both also has Mill power and Hot billet (heater)
 * beside Specific energy (the user, 25 Nov 2026): fourteen, two rows of seven. The panels below stay as they are.
 */
export default function KpiStrip() {
  const mode = useGlobalSel().rmdMode;
  return (
    <section className={`rm-strip ${mode === 'offline' ? 'rm-strip--six' : 'rm-strip--seven'}`} aria-label="Headline KPIs">
      {mode === 'all' && (
        <>
          {/* Live from the ERP, for the Duration filter's period; opens the ERP-vs-Influx drawer. */}
          <ProductionKpiCard />
          {/* Live from the ERP log sheet: Σ production ÷ Σ billet input; opens the yield drawer. */}
          <YieldKpiCard />
          {/* Live: Σ power-consumed of the logbook form Electrical HSM → Power Consumption, by the form's date. */}
          <PowerKpiCard />
          {/* Live: logbook power ÷ the Production card's Total (Influx), kWh/MT. */}
          <SpecificEnergyCard />
          {/* Electrical HSM → Billet Heater Performance & Mill Power: mill power kWh/MT, hot billet (heater) MT. */}
          <HsmHeaterPowerCards />
          {/* The ERP stock at the period's end, dated; replaces the Order allocation panel (the user, 31 Oct 2026). */}
          <FinishedStockCard mill="hsm" />
        </>
      )}
      <HsmRollingCards />
    </section>
  );
}
