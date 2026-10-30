'use client';

/**
 * HSM Condition Analytics · Specific energy, as the HSM sheet: energy ÷ ERP FG posted MT. The plant
 * has no EMS meter (the user, 26 Oct 2026), so the energy is the logbook Electrical HSM → Power
 * Consumption; over the days that have both a power entry and an ERP production entry (ERP comes a
 * day late). Opens each day.
 */
import { useMemo, useState } from 'react';
import { lastFigure, useLastEntry } from '@/services/lastEntry';
import { bothLast } from '@/components/production/SpecificEnergyCard';
import KpiCard from '@/components/visualization/KpiCard';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import SourceBox from '@/components/drill/SourceBox';
import { fixed } from '@/lib/num';
import { dm, useProduction, useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type PowerReport } from '@/services/hsmApi';

export default function HsmSpecificEnergy() {
  const { dates } = useSelection();
  const powerUrl = rangeUrl('/api/hsm/power', dates);
  const powerS = useApi<PowerReport>(powerUrl);
  const power = powerS.data && powerS.dataUrl === powerUrl ? powerS.data : null;
  const prod = useProduction(dates ? { ...dates, grain: 'day' } : null);
  const [open, setOpen] = useState(false);

  const days = useMemo(() => {
    const erp = new Map((prod.data?.days ?? []).map((d) => [d.date, d.erpMt]));
    return (power?.days ?? []).map((d) => ({ date: d.date, kwh: d.kwh, erpMt: erp.get(d.date) ?? null }));
  }, [power, prod.data]);
  const both = days.filter((d) => d.kwh !== null && d.erpMt !== null && d.erpMt > 0);
  const kwh = both.reduce((a, d) => a + d.kwh!, 0);
  const mt = both.reduce((a, d) => a + d.erpMt!, 0);
  const perMt = mt > 0 ? kwh / mt : null;
  /* No day with both in the period: the last day that has both power and ERP production (the user, 30 Oct 2026). */
  const last = useLastEntry<PowerReport>('/api/hsm/power', !!power && !!prod.data && perMt === null, bothLast(power?.lastDate, prod.data?.erp.lastDate), dates?.from);

  return (
    <>
      <KpiCard label="Specific energy" value={perMt === null ? 'NA' : fixed(perMt, 1)} unit="kWh/MT" note="" series="hold"
        noEntries={!!power && !!prod.data && perMt === null}
        lastEntry={lastFigure(perMt, last, (d) => d.totals.kwhPerMt, (n) => fixed(n, 1))}
        loading={!power && !powerS.error} onOpen={() => setOpen(true)} openLabel="Power and ERP production per day" />
      <DrillDrawer open={open} onClose={() => setOpen(false)} title="Specific energy" sub="HSM · kWh/MT"
        loading={!power && !powerS.error} error={powerS.error} hasData={!!power}>
        <Stats items={[
          { label: 'Specific energy', value: perMt === null ? 'NA' : fixed(perMt, 1), unit: 'kWh/MT', tone: perMt === null ? 'v-na' : undefined },
          { label: 'Power', value: fixed(kwh, 0), unit: `kWh · ${both.length} day${both.length === 1 ? '' : 's'}` },
          { label: 'ERP production', value: fixed(mt, 1), unit: 'MT' },
        ]} />
        <div className="pd-table-wrap">
          <table className="grid pd-table" aria-label="Specific energy per day">
            <thead><tr><th>Day</th><th className="r">Power (kWh)</th><th className="r">ERP production (MT)</th><th className="r">kWh/MT</th></tr></thead>
            <tbody>
              {days.map((d) => {
                const v = d.kwh !== null && d.erpMt ? d.kwh / d.erpMt : null;
                return (
                  <tr key={d.date}>
                    <td><b>{dm(d.date)}</b></td>
                    <td className={`num r ${d.kwh === null ? 'v-na' : ''}`}>{d.kwh === null ? '—' : fixed(d.kwh, 0)}</td>
                    <td className={`num r ${d.erpMt === null ? 'v-na' : ''}`}>{d.erpMt === null ? '—' : fixed(d.erpMt, 1)}</td>
                    <td className={`num r ${v === null ? 'v-na' : 'v-val'}`}>{v === null ? '—' : fixed(v, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <SourceBox
          sources={[
            { name: 'Logbook', rows: [['Form', 'Electrical HSM → Power Consumption'], ['Field', 'power consumed (kWh), every meter — by the form\'s date']] },
            { name: 'ERP', rows: [['Table', 'Production Log Sheet (division S1, series L6P)'], ['Field', 'PRODUCTION_MT']] },
          ]}
          formula={['Specific energy = Σ power ÷ Σ ERP production, over the days that have both (no EMS meter on the plant)']}
        />
      </DrillDrawer>
    </>
  );
}
