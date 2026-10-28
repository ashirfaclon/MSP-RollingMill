'use client';

/**
 * Power consumption, from the logbook form "Electrical HSM → Power Consumption": the sum of
 * `power-consumed` (kWh) over every entry dated in the Duration period, all meters together,
 * shown in MWh. The form's own date is used as entered — the card shows what is being filled.
 * Opens the drawer listing every entry behind the figure.
 */
import { useState } from 'react';
import KpiCard from '@/components/visualization/KpiCard';
import PowerDrawer, { type PowerMill } from '@/components/drill/PowerDrawer';
import { fixed } from '@/lib/num';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type PowerReport } from '@/services/hsmApi';

export function usePower(mill: PowerMill = 'hsm') {
  const { dates } = useSelection();
  const url = rangeUrl(`/api/${mill}/power`, dates);
  const s = useApi<PowerReport>(url);
  const data = s.data && s.dataUrl === url ? s.data : null;
  return { data, loading: !data && !s.error, error: s.error };
}

export default function PowerKpiCard({ mill = 'hsm' }: { mill?: PowerMill }) {
  const { data, loading, error } = usePower(mill);
  const [open, setOpen] = useState(false);
  const kwh = data?.totals.kwh ?? null;
  const note = error ? 'Logbook unavailable'
    : data?.logbook.connection === 'down' ? data.logbook.message
    : '';
  return (
    <>
      <KpiCard
        label="Power consumption"
        value={kwh === null ? (data ? 'NA' : '—') : fixed(kwh / 1000, 2)}
        unit="MWh"
        note={note}
        series="prod"
        loading={loading}
        noEntries={!!data && data.logbook.connection !== 'down' && data.totals.entries === 0}
        onOpen={() => setOpen(true)}
        openLabel="Logbook power entries behind this figure"
      />
      <PowerDrawer open={open} onClose={() => setOpen(false)} data={data} loading={loading} error={error} mill={mill} />
    </>
  );
}
