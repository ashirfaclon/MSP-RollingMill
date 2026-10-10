'use client';

/**
 * RMD headline cards — the same seven as HSM, in the same order and anatomy. Only what the
 * plant has confirmed is wired:
 *   Production          ERP Production Log Sheet (FA-SKJ, PRODUCT_PRIME_SLENGTH_MT);
 *   Mass yield          production ÷ billet input — billet input in MT has no source yet,
 *                       so NA; its drawer shows the billets counted (Influx);
 *   Power consumption   the logbook forms Power Reading VCB 1 / 2 / 3 (live, as filled);
 *   Specific energy     power ÷ ERP production (backend power report);
 *   Made To Stock, Stock with order, Free stock   nothing yet (plan / ERP to come).
 * A card with nothing behind it opens nothing.
 */
import { useState } from 'react';
import KpiCard from '@/components/visualization/KpiCard';
import PowerKpiCard from '@/components/production/PowerKpiCard';
import SpecificEnergyCard from '@/components/production/SpecificEnergyCard';
import { fixed } from '@/lib/num';
import { dm, useSelection } from '@/services/hsmProduction';
import RmdYieldDrawer from './RmdYieldDrawer';
import RmdProductionDrawer, { useRmdProduction } from './RmdProductionDrawer';

export default function RmdKpiStrip() {
  const [yieldOpen, setYieldOpen] = useState(false);
  const [prodOpen, setProdOpen] = useState(false);
  const { dates } = useSelection();
  const { data, error } = useRmdProduction(dates);
  const t = data?.totals;
  // The ERP is entered a day or two late: say how far, so a part-period figure is not read as the whole.
  const note = error ? 'ERP data unavailable'
    : !t ? ''
    : data!.erp.connection === 'down' ? data!.erp.message
    : t.entryDays === 0 ? `Not entered yet · entered to ${dm(data!.erp.lastDate)}`
    : t.entryDays < t.days ? `ERP entered to ${dm(data!.erp.lastDate)}`
    : '';

  return (
    <section className="rm-strip" aria-label="Headline KPIs">
      <KpiCard
        label="Production"
        value={t?.productionMt == null ? 'NA' : fixed(t.productionMt, 1)}
        unit="MT"
        note={note}
        series="prod"
        loading={!data && !error}
        onOpen={() => setProdOpen(true)}
        openLabel="Production per day, from the ERP log sheet"
      />
      <RmdProductionDrawer view="production" open={prodOpen} onClose={() => setProdOpen(false)} />
      <KpiCard
        label="Mass yield"
        value="NA"
        unit="%"
        note="Billet input MT pending"
        series="order"
        onOpen={() => setYieldOpen(true)}
        openLabel="Billets in per day, the wired part of the yield"
      />
      <RmdYieldDrawer open={yieldOpen} onClose={() => setYieldOpen(false)} />
      <PowerKpiCard mill="rmd" />
      <SpecificEnergyCard mill="rmd" />
      <KpiCard label="Made To Stock" value="NA" unit="MT" note="" series="free" />
      <KpiCard label="Stock with order" value="NA" unit="MT" note="" series="order" />
      <KpiCard label="Free stock" value="NA" unit="MT" note="" series="free" />
    </section>
  );
}
