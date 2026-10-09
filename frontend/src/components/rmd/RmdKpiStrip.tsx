'use client';

/**
 * RMD headline cards — the same seven as HSM, in the same order and anatomy. Only what the
 * plant has confirmed is wired:
 *   Power consumption   the logbook forms Power Reading VCB 1 / 2 / 3 (live, as filled);
 *   Mass yield          the Influx billet counters are wired (its drawer); the ERP finished
 *                       production it divides is on hold, so the yield is NA;
 *   Specific energy     power ÷ production — NA until production is wired;
 *   Production          on hold until its ERP field is given;
 *   Made To Stock, Stock with order, Free stock   nothing yet (plan / ERP to come).
 * A card with nothing behind it opens nothing.
 */
import { useState } from 'react';
import KpiCard from '@/components/visualization/KpiCard';
import PowerKpiCard from '@/components/production/PowerKpiCard';
import RmdYieldDrawer from './RmdYieldDrawer';

export default function RmdKpiStrip() {
  const [yieldOpen, setYieldOpen] = useState(false);
  return (
    <section className="rm-strip" aria-label="Headline KPIs">
      <KpiCard label="Production" value="NA" unit="MT" note="ERP source pending" series="prod" />
      <KpiCard
        label="Mass yield"
        value="NA"
        unit="%"
        note="ERP finished pending"
        series="order"
        onOpen={() => setYieldOpen(true)}
        openLabel="Billets in per day, the wired part of the yield"
      />
      <RmdYieldDrawer open={yieldOpen} onClose={() => setYieldOpen(false)} />
      <PowerKpiCard mill="rmd" />
      <KpiCard label="Specific energy" value="NA" unit="kWh/MT" note="Production pending" series="prod" />
      <KpiCard label="Made To Stock" value="NA" unit="MT" note="" series="free" />
      <KpiCard label="Stock with order" value="NA" unit="MT" note="" series="order" />
      <KpiCard label="Free stock" value="NA" unit="MT" note="" series="free" />
    </section>
  );
}
