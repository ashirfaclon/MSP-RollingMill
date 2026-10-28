'use client';

/**
 * Specific energy = power consumption (logbook forms, kWh) ÷ production for the Duration
 * period — computed in the backend's power report. HSM divides by the Influx counter, RMD by
 * the ERP log sheet. Opens the drawer that shows both per day.
 */
import { useState } from 'react';
import KpiCard from '@/components/visualization/KpiCard';
import SpecificEnergyDrawer from '@/components/drill/SpecificEnergyDrawer';
import { fixed } from '@/lib/num';
import type { PowerMill } from '@/components/drill/PowerDrawer';
import { usePower } from './PowerKpiCard';

export default function SpecificEnergyCard({ mill = 'hsm' }: { mill?: PowerMill }) {
  const { data, loading, error } = usePower(mill);
  const [open, setOpen] = useState(false);
  const t = data?.totals;
  const note = error ? 'Logbook unavailable'
    : data?.logbook.connection === 'down' ? data.logbook.message
    : '';
  // Wired, nothing recorded: no power entries, or no production entered for the period.
  const empty = !t || error || data?.logbook.connection === 'down' ? false
    : t.kwh === null ? 'No power entries recorded yet'
    : !t.productionMt ? 'No production entries recorded yet'
    : false;
  return (
    <>
      <KpiCard
        label="Specific energy"
        value={t?.kwhPerMt == null ? (data ? 'NA' : '—') : fixed(t.kwhPerMt, 1)}
        unit="kWh/MT"
        note={note}
        series="prod"
        loading={loading}
        noEntries={empty}
        onOpen={() => setOpen(true)}
        openLabel="Power and production per day"
      />
      <SpecificEnergyDrawer open={open} onClose={() => setOpen(false)} data={data} loading={loading} error={error} mill={mill} />
    </>
  );
}
