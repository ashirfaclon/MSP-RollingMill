'use client';

/**
 * RMD Mill MPS — as the plant gave it: CR Mill1/2 · General · MILL1_MPS and MILL2_MPS (m/s).
 * Two cards, Mill 1 and Mill 2 (the user, 30 Oct 2026): each its last reading of the period (now,
 * for today) with the period's trend as a sparkline under it; either opens both mills' speed.
 */
import { useMemo, useState } from 'react';
import KpiCard from '@/components/visualization/KpiCard';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox from '@/components/drill/SourceBox';
import { fixed } from '@/lib/num';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmdMillSpeedReport } from '@/services/hsmApi';

const AT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
const mps = (v: number | null | undefined) => (v == null ? 'NA' : fixed(v, 2));

export default function RmdMillSpeedCard() {
  const { dates } = useSelection();
  const url = rangeUrl('/api/rmd/mill-speed', dates);
  const { data, dataUrl, error } = useApi<RmdMillSpeedReport>(url);
  const r = data && dataUrl === url ? data : null;
  const [open, setOpen] = useState(false);
  const card = (mill: 'mill1' | 'mill2', label: string, series: 'prod' | 'order') => {
    const v = r?.latest[mill] ?? null;
    return (
      <KpiCard
        key={mill}
        label={label}
        value={mps(v)}
        unit="m/s"
        note={r?.historian.connection === 'down' ? r.historian.message : ''}
        noEntries={!!r && r.historian.connection === 'up' && v == null ? 'No readings in this period' : false}
        series={series}
        loading={!r && !error}
        spark={r ? { values: r.trend.map((p) => p[mill]), label: `${label} over the period` } : undefined}
        onOpen={() => setOpen(true)}
        openLabel="Mill 1 and mill 2 speed over the period"
      />
    );
  };
  return (
    <>
      {card('mill1', 'Mill 1 MPS', 'prod')}
      {card('mill2', 'Mill 2 MPS', 'order')}
      <DrillDrawer open={open} onClose={() => setOpen(false)} title="Mill MPS" sub="RMD · m/s"
        loading={!r && !error} error={error} hasData={!!r}>
        {r && <Content r={r} />}
      </DrillDrawer>
    </>
  );
}

function Content({ r }: { r: RmdMillSpeedReport }) {
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'm1', name: 'Mill 1', token: '--s-prod', type: 'line', data: r.trend.map((p) => [Date.parse(p.t), p.mill1] as [number, number | null]), dp: 2 },
    { id: 'm2', name: 'Mill 2', token: '--s-order', type: 'line', data: r.trend.map((p) => [Date.parse(p.t), p.mill2] as [number, number | null]), dp: 2 },
  ], [r]);
  const axes = useMemo(() => [{ title: 'm/s', unit: 'm/s', min: 0 }], []);
  return (
    <>
      <Stats items={[
        { label: 'Mill 1', value: mps(r.latest.mill1), unit: 'm/s', tone: r.latest.mill1 === null ? 'v-na' : undefined },
        { label: 'Mill 2', value: mps(r.latest.mill2), unit: 'm/s', tone: r.latest.mill2 === null ? 'v-na' : undefined },
        { label: 'Reading at', value: r.latest.at ? AT.format(new Date(r.latest.at)) : 'NA', unit: 'IST', wrap: true },
      ]} />
      {r.trend.length > 0 && (
        <DrillChart series={series} axes={axes}
          ariaLabel={`Mill speed, mean per ${r.bucketMinutes} minutes: ${r.trend.map((p) => `${p.t} mill 1 ${fmtNum(p.mill1, 2)}, mill 2 ${fmtNum(p.mill2, 2)} m/s`).join('; ')}`} />
      )}
      <SourceBox
        sources={[{ name: 'Influx', rows: [
          ['Tag', 'MILL1_MPS (mill 1), MILL2_MPS (mill 2)'],
          ['Filter', "_measurement = 'TMT-RMD', Unit = 'CR Mill1/2', Group = 'General'"],
        ] }]}
        formula={[
          'Card = each mill\'s last reading of the period (m/s)',
          `Chart = mean reading per ${r.bucketMinutes} minutes`,
          'Day = 09:00 IST → 09:00 IST',
        ]}
      />
      {r.historian.connection === 'down' && <p className="v-warn">{r.historian.message}</p>}
    </>
  );
}
