'use client';

/**
 * RMS power cards (the user, 26 Nov 2026), from the RMS Daily Power Consumption Record as updated:
 *   Power consumption  RMS's own power — total drawn (VCB-1 + VCB-2) less the HSM share, crusher and colony — with its
 *                      share of what was drawn under it; opens the power sharing view;
 *   Power factor       kWh ÷ kVAh of the two meters together, each meter under it; opens the power factor view.
 * An old-form entry (VCB-1 only, no sharing) counts as the meter reading it is, and the card says so.
 */
import { useState } from 'react';
import KpiCard from '@/components/visualization/KpiCard';
import { usePower } from '@/components/production/PowerKpiCard';
import { fixed } from '@/lib/num';
import RmsPowerDrawer from './RmsPowerDrawer';

const mwh = (kwh: number) => fixed(kwh / 1000, 2);

export function RmsPowerCard() {
  const { data, loading, error, last } = usePower('rms');
  const [open, setOpen] = useState(false);
  const t = data?.totals;
  const kwh = t?.kwh ?? null;
  const s = t?.rms;
  const lastKwh = last.data?.totals.kwh ?? null;
  const down = error ? 'Logbook unavailable' : data?.logbook.connection === 'down' ? data.logbook.message : '';
  // Under the figure: RMS's share of what was drawn; or that the figure is a meter reading (old form, no sharing).
  const note = down || (kwh === null || !s ? ''
    : s.meterOnlyKwh === null && s.rmsKwh !== null && s.totalKwh
      ? <><b className="num">{fixed((s.rmsKwh / s.totalKwh) * 100)} %</b> of total drawn</>
    : s.rmsKwh === null ? 'VCB-1 reading · not shared out'
    : <>incl. <b className="num">{mwh(s.meterOnlyKwh ?? 0)} MWh</b> VCB-1 reading</>);
  return (
    <>
      <KpiCard
        label="Power consumption"
        value={kwh === null ? (data ? 'NA' : '—') : mwh(kwh)}
        unit="MWh"
        note={note}
        series="prod"
        loading={loading}
        noEntries={!!data && data.logbook.connection !== 'down' && data.totals.entries === 0}
        lastEntry={kwh === null && lastKwh !== null && last.date ? { value: mwh(lastKwh), date: last.date } : null}
        onOpen={() => setOpen(true)}
        openLabel="Power sharing per day: RMS, HSM share, crusher, colony"
      />
      <RmsPowerDrawer view="sharing" open={open} onClose={() => setOpen(false)} data={data} loading={loading} error={error} />
    </>
  );
}

export function RmsPowerFactorCard() {
  const { data, loading, error, last } = usePower('rms');
  const [open, setOpen] = useState(false);
  const s = data?.totals.rms;
  const pf = s?.pf ?? null;
  const lastPf = last.data?.totals.rms?.pf ?? null;
  const down = error ? 'Logbook unavailable' : data?.logbook.connection === 'down' ? data.logbook.message : '';
  const two = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(2));
  return (
    <>
      <KpiCard
        label="Power factor"
        value={pf === null ? (data ? 'NA' : '—') : pf.toFixed(2)}
        unit=""
        note={down || (pf !== null && s ? <>VCB-1: <b className="num">{two(s.pf1)}</b> · VCB-2: <b className="num">{two(s.pf2)}</b></> : '')}
        series="ok"
        loading={loading}
        noEntries={!!data && data.logbook.connection !== 'down' && data.totals.entries === 0}
        lastEntry={pf === null && lastPf !== null && last.date ? { value: lastPf.toFixed(2), date: last.date } : null}
        onOpen={() => setOpen(true)}
        openLabel="Power factor per day, each meter"
      />
      <RmsPowerDrawer view="pf" open={open} onClose={() => setOpen(false)} data={data} loading={loading} error={error} />
    </>
  );
}
