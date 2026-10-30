'use client';

/**
 * Specific energy = power consumption (logbook forms, kWh) ÷ production for the Duration
 * period — computed in the backend's power report. Every mill divides by its ERP log sheet's
 * production (the user, 30 Oct 2026). Opens the drawer that shows both per day.
 */
import { useState } from 'react';
import { useLastEntry } from '@/services/lastEntry';
import { useProduction, useSelection } from '@/services/hsmProduction';
import type { PowerReport } from '@/services/hsmApi';
import { useRmdProduction } from '@/components/rmd/RmdProductionDrawer';
import { useLsmProduction } from '@/components/lsm/LsmProductionDrawer';
import { useRmsProduction } from '@/components/rms/RmsProductionDrawer';
import KpiCard from '@/components/visualization/KpiCard';
import SpecificEnergyDrawer from '@/components/drill/SpecificEnergyDrawer';
import { fixed } from '@/lib/num';
import type { PowerMill } from '@/components/drill/PowerDrawer';
import { usePower } from './PowerKpiCard';

/** The ERP log sheet's last booked date for a mill — what specific energy divides by. */
export function useErpLastDate(mill: PowerMill): string | null {
  const { dates } = useSelection();
  const hsm = useProduction(mill === 'hsm' && dates ? { ...dates, grain: 'day' } : null).data?.erp.lastDate ?? null;
  const rmd = useRmdProduction(mill === 'rmd' ? dates : null).data?.erp.lastDate ?? null;
  const lsm = useLsmProduction(mill === 'lsm' ? dates : null).data?.erp.lastDate ?? null;
  const rms = useRmsProduction(mill === 'rms' ? dates : null).data?.erp.lastDate ?? null;
  return { hsm, rmd, lsm, rms }[mill];
}

/** The last day with both a power entry and ERP production: the earlier of the two last dates. */
export const bothLast = (a: string | null | undefined, b: string | null | undefined) => (a && b ? (a < b ? a : b) : null);

export default function SpecificEnergyCard({ mill = 'hsm' }: { mill?: PowerMill }) {
  const { data, loading, error } = usePower(mill);
  const { dates } = useSelection();
  /* No figure in the period (no power, or no ERP production yet): the last day that has both (the user, 30 Oct 2026). */
  const erpLast = useErpLastDate(mill);
  const last = useLastEntry<PowerReport>(`/api/${mill}/power`, !!data && data.totals.kwhPerMt === null, bothLast(data?.lastDate, erpLast), dates?.from);
  const lastSe = last.data?.totals.kwhPerMt ?? null;
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
        lastEntry={t?.kwhPerMt == null && lastSe !== null && last.date ? { value: fixed(lastSe, 1), date: last.date } : null}
        onOpen={() => setOpen(true)}
        openLabel="Power and production per day"
      />
      <SpecificEnergyDrawer open={open} onClose={() => setOpen(false)} data={data} loading={loading} error={error} mill={mill} />
    </>
  );
}
