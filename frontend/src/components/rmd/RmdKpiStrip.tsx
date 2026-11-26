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
 *   Rolling in casting / Rolling in delivery / Plant efficiency  the Zoho TMT KPIs the plant asked for
 *                       (21 Nov 2026), as the ERP log sheet holds them: ROLLING_IN_TOTAL_PERCENTAGE,
 *                       ROLLING_IN_DELIVERY_PRCNT (one drawer); Plant efficiency, the plant's formula worked out here
 *                       (the user, 26 Nov 2026): performance (actual ÷ the dashboard's plan) × availability ((running −
 *                       breakdown) ÷ running), Prime + SL and Prime in one card, its own drawer;
 *                       Rolling in casting not under Offline (the user, 25 Nov 2026);
 *   Power consumption   the logbook forms Power Reading VCB 1 / 2 / 3 (live, as filled);
 *   Specific energy     power ÷ ERP production (backend power report);
 *   Mill MPS            Influx CR Mill1/2 · General · MILL1_MPS / MILL2_MPS, m/s, one card (RmdMillSpeedCard);
 *   Chemical composition  SMS → CCM Lolipop Sample, the RMD samples (RmdChemistryCard).
 *   Coal consumption    Offline only (the user, 24 Nov 2026): the ERP log sheet's coal, kg per MT of Prime + SL
 *                       (COAL_CONSUMPTION_KGMT; over several entries Σ TOTAL_COAL_CONSUMPTION ÷ Σ Prime + SL);
 *                       it takes Rolling in casting's place, so Offline stays two rows of six.
 *   Breakdown           the plant's sheet (the user, 25 Nov 2026): the ERP log sheet's seven breakdown items, hours;
 *                       opens each item on its own, like Finished stock (RmdBreakdownCard).
 * A card with nothing behind it opens nothing.
 */
import { useState } from 'react';
import KpiCard from '@/components/visualization/KpiCard';
import PowerKpiCard from '@/components/production/PowerKpiCard';
import SpecificEnergyCard from '@/components/production/SpecificEnergyCard';
import RmdMillSpeedCard from './RmdMillSpeedCard';
import RmdChemistryCard from './RmdChemistryCard';
import RmdBreakdownCard from './RmdBreakdownCard';
import FinishedStockCard from '@/components/production/FinishedStockCard';
import { productionTermText } from '@/components/production/productionTerm';
import { fixed } from '@/lib/num';
import { useSelection } from '@/services/hsmProduction';
import { useGlobalSel } from '@/state/globalSel';
import RmdProductionDrawer, { useRmdProduction } from './RmdProductionDrawer';

const mt1 = (v: number | null | undefined) => (v == null ? 'NA' : fixed(v, 1));

export default function RmdKpiStrip() {
  const [yieldOpen, setYieldOpen] = useState(false);
  const [prodOpen, setProdOpen] = useState(false);
  const [perfOpen, setPerfOpen] = useState(false);
  const [effOpen, setEffOpen] = useState(false);
  const [coalOpen, setCoalOpen] = useState(false);
  const offline = useGlobalSel().rmdMode === 'offline';
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
      {/* Two yields in one card, so the strip keeps its two rows of six: Prime + SL (mass yield) and
          Prime alone (the user, 24 Nov 2026), each ÷ billet input. */}
      <KpiCard
        label="Mass yield"
        value={t?.massYieldPct == null ? 'NA' : fixed(t.massYieldPct, 1)}
        pair={t ? [
          { source: 'Prime + SL', value: t.massYieldPct == null ? 'NA' : fixed(t.massYieldPct) },
          { source: 'Prime', value: t.primeYieldPct == null ? 'NA' : fixed(t.primeYieldPct) },
        ] : undefined}
        noEntries={up && t?.massYieldPct == null}
        lastEntry={(() => {
          const l = lastOf(t?.massYieldPct, (lt) => lt.massYieldPct);
          const lp = last.data?.totals.primeYieldPct;
          return l ? { ...l, pair: [{ source: 'Prime + SL', value: l.value }, { source: 'Prime', value: lp == null ? 'NA' : fixed(lp) }] } : null;
        })()}
        unit="%"
        note={note}
        series="order"
        loading={!data && !error}
        onOpen={() => setYieldOpen(true)}
        openLabel="Mass yield per day, prime + SL and prime, from the ERP log sheet"
      />
      <RmdProductionDrawer view="yield" open={yieldOpen} onClose={() => setYieldOpen(false)} />
      {/* Row 1 ends with the Zoho TMT KPIs (the plant, 21 Nov 2026); one drawer for the three. */}
      {([
        ['Rolling in casting', 'rollingInCastingPct'],
        ['Rolling in delivery', 'rollingInDeliveryPct'],
      ] as const).filter(([, k]) => !(offline && k === 'rollingInCastingPct')).map(([label, k]) => (
        <KpiCard
          key={k}
          label={label}
          term={term}
          value={t?.[k] == null ? 'NA' : fixed(t[k], 1)}
          noEntries={up && t?.[k] == null}
          lastEntry={lastOf(t?.[k], (lt) => lt[k])}
          unit="%"
          note={note}
          series="ok"
          loading={!data && !error}
          onOpen={() => setPerfOpen(true)}
          openLabel="Rolling in casting and rolling in delivery per day, from the ERP log sheet"
        />
      ))}
      <RmdProductionDrawer view="performance" open={perfOpen} onClose={() => setPerfOpen(false)} />
      {/* Plant efficiency, the plant's formula (the user, 26 Nov 2026): Prime + SL and Prime, as Mass yield's two. */}
      <KpiCard
        label="Plant efficiency"
        term={term}
        value={t?.plantEfficiencyPct == null ? 'NA' : fixed(t.plantEfficiencyPct)}
        pair={t ? [
          { source: 'Prime + SL', value: t.plantEfficiencyPct == null ? 'NA' : fixed(t.plantEfficiencyPct) },
          { source: 'Prime', value: t.primeEfficiencyPct == null ? 'NA' : fixed(t.primeEfficiencyPct) },
        ] : undefined}
        noEntries={up && t?.plantEfficiencyPct == null ? (t && t.entryDays > 0 && !t.effDays ? 'No production plan for these days' : true) : false}
        lastEntry={(() => {
          const l = lastOf(t?.plantEfficiencyPct, (lt) => lt.plantEfficiencyPct, 2);
          const lp = last.data?.totals.primeEfficiencyPct;
          return l ? { ...l, pair: [{ source: 'Prime + SL', value: l.value }, { source: 'Prime', value: lp == null ? 'NA' : fixed(lp) }] } : null;
        })()}
        unit="%"
        note={note}
        series="ok"
        loading={!data && !error}
        onOpen={() => setEffOpen(true)}
        openLabel="Plant efficiency per day — performance against the plan and availability"
      />
      <RmdProductionDrawer view="efficiency" open={effOpen} onClose={() => setEffOpen(false)} />
      <PowerKpiCard mill="rmd" />
      <SpecificEnergyCard mill="rmd" />
      {offline && (
        <>
          <KpiCard
            label="Coal consumption"
            term={term}
            value={t?.coalKgPerMt == null ? 'NA' : fixed(t.coalKgPerMt)}
            noEntries={up && t?.coalKgPerMt == null}
            lastEntry={lastOf(t?.coalKgPerMt, (lt) => lt.coalKgPerMt, 2)}
            unit="kg/MT"
            note={note}
            series="hold"
            loading={!data && !error}
            onOpen={() => setCoalOpen(true)}
            openLabel="Coal consumption per day, from the ERP log sheet"
          />
          <RmdProductionDrawer view="coal" open={coalOpen} onClose={() => setCoalOpen(false)} />
        </>
      )}
      <RmdMillSpeedCard />
      <RmdChemistryCard />
      <RmdBreakdownCard data={data} error={error} term={term} lastEntry={lastOf(t?.breakdownHrs, (lt) => lt.breakdownHrs, 2)} />
      {/* The ERP stock at the period's end, dated; replaces the Order allocation panel (the user, 31 Oct 2026). */}
      <FinishedStockCard mill="rmd" />
    </section>
  );
}
