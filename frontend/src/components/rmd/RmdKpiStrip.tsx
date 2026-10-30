'use client';

/**
 * RMD headline cards — HSM's first four, in the same order and anatomy, with production as
 * two cards (one per ERP declaration). RMD has no Made To
 * Stock / Made To Order split and its stock is all free stock, so the three order/stock cards
 * are not shown (user, 12 Oct 2026). Only what the plant has confirmed is wired:
 *   Prime + SL, Prime   ERP Production Log Sheet (FA-SKJ), the two daily production declarations:
 *                       PRODUCT_PRIME_SLENGTH_MT (Prime + SL, SL = short length, which every other
 *                       figure uses) and FINISH_PRODUCT_PRIME_MT (Prime); both open one drawer;
 *   Mass yield          Prime + SL ÷ billet input (INPUT_MT), both from the ERP log sheet;
 *   Power consumption   the logbook forms Power Reading VCB 1 / 2 / 3 (live, as filled);
 *   Specific energy     power ÷ ERP production (backend power report);
 *   Mill MPS            Influx CR Mill1/2 · General · MILL1_MPS / MILL2_MPS, m/s (RmdMillSpeedCard);
 *   Chemical composition  SMS → CCM Lolipop Sample, the RMD samples (RmdChemistryCard).
 * A card with nothing behind it opens nothing.
 */
import { useState } from 'react';
import KpiCard from '@/components/visualization/KpiCard';
import PowerKpiCard from '@/components/production/PowerKpiCard';
import SpecificEnergyCard from '@/components/production/SpecificEnergyCard';
import RmdMillSpeedCard from './RmdMillSpeedCard';
import RmdChemistryCard from './RmdChemistryCard';
import FinishedStockCard from '@/components/production/FinishedStockCard';
import { productionTermText } from '@/components/production/productionTerm';
import { fixed } from '@/lib/num';
import { useSelection } from '@/services/hsmProduction';
import RmdProductionDrawer, { useRmdProduction } from './RmdProductionDrawer';

const mt1 = (v: number | null | undefined) => (v == null ? 'NA' : fixed(v, 1));

export default function RmdKpiStrip() {
  const [yieldOpen, setYieldOpen] = useState(false);
  const [prodOpen, setProdOpen] = useState(false);
  const { dates } = useSelection();
  const { data, error, last } = useRmdProduction(dates);
  const t = data?.totals;
  /* A card's last entry: that day's figure, when the period has none. */
  const lastOf = (v: number | null | undefined, pick: (lt: NonNullable<typeof last.data>['totals']) => number | null, dp = 1) => {
    const lv = last.data ? pick(last.data.totals) : null;
    return v == null && lv != null && last.date ? { value: fixed(lv, dp), date: last.date } : null;
  };
  // Only a connection problem is noted on the card.
  const note = error ? 'ERP data unavailable'
    : data?.erp.connection === 'down' ? data.erp.message
    : '';
  const up = !!data && data.erp.connection === 'up';
  // The days the production cards cover (the user, 31 Oct 2026).
  const term = data ? productionTermText(data.from, data.to, data.erp.lastDate) : null;

  return (
    <section className="rm-strip rmd-strip" aria-label="Headline KPIs">
      <KpiCard
        label="Production · Prime + SL"
        term={term}
        value={mt1(t?.productionMt)}
        noEntries={up && t?.productionMt == null}
        lastEntry={lastOf(t?.productionMt, (lt) => lt.productionMt)}
        unit="MT"
        note={note}
        series="prod"
        loading={!data && !error}
        onOpen={() => setProdOpen(true)}
        openLabel="Production per day, prime + SL and prime, from the ERP log sheet"
      />
      <KpiCard
        label="Production · Prime"
        term={term}
        value={mt1(t?.primeMt)}
        noEntries={up && t?.primeMt == null}
        lastEntry={lastOf(t?.primeMt, (lt) => lt.primeMt)}
        unit="MT"
        note={note}
        series="prod"
        loading={!data && !error}
        onOpen={() => setProdOpen(true)}
        openLabel="Production per day, prime + SL and prime, from the ERP log sheet"
      />
      <RmdProductionDrawer view="production" open={prodOpen} onClose={() => setProdOpen(false)} />
      <KpiCard
        label="Mass yield"
        value={t?.massYieldPct == null ? 'NA' : fixed(t.massYieldPct, 1)}
        noEntries={up && t?.massYieldPct == null}
        lastEntry={lastOf(t?.massYieldPct, (lt) => lt.massYieldPct)}
        unit="%"
        note={note}
        series="order"
        loading={!data && !error}
        onOpen={() => setYieldOpen(true)}
        openLabel="Mass yield per day, from the ERP log sheet"
      />
      <RmdProductionDrawer view="yield" open={yieldOpen} onClose={() => setYieldOpen(false)} />
      <PowerKpiCard mill="rmd" />
      <SpecificEnergyCard mill="rmd" />
      <RmdMillSpeedCard />
      <RmdChemistryCard />
      {/* The ERP stock at the period's end, dated; replaces the Order allocation panel (the user, 31 Oct 2026). */}
      <FinishedStockCard mill="rmd" />
    </section>
  );
}
