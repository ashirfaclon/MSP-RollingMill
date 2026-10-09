'use client';

/**
 * Specific energy = power consumption (logbook form, kWh) ÷ production (the Production card's
 * Total, Influx, MT) for the Duration period — computed in the backend's power report. Opens
 * the power drawer, which shows both per day.
 */
import { useState } from 'react';
import KpiCard from '@/components/visualization/KpiCard';
import SpecificEnergyDrawer from '@/components/drill/SpecificEnergyDrawer';
import { fixed } from '@/lib/num';
import { usePower } from './PowerKpiCard';

export default function SpecificEnergyCard() {
  const { data, loading, error } = usePower();
  const [open, setOpen] = useState(false);
  const t = data?.totals;
  const note = error ? 'Logbook unavailable'
    : data?.logbook.connection === 'down' ? data.logbook.message
    : t && t.kwh === null ? 'No power entries for this period'
    : t && !t.productionMt ? 'No production for this period'
    : '';
  return (
    <>
      <KpiCard
        label="Specific energy"
        value={t?.kwhPerMt == null ? (data ? 'NA' : '—') : fixed(t.kwhPerMt, 1)}
        unit="kWh/MT"
        note={note}
        series="prod"
        loading={loading}
        onOpen={() => setOpen(true)}
        openLabel="Power and production per day"
      />
      <SpecificEnergyDrawer open={open} onClose={() => setOpen(false)} data={data} loading={loading} error={error} />
    </>
  );
}
