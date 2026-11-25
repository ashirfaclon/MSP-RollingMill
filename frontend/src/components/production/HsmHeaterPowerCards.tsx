'use client';

/**
 * HSM Visualization, under Both (the user, 25 Nov 2026): two cards from the logbook's Electrical HSM → Billet
 * Heater Performance & Mill Power, beside Specific energy —
 *   Mill power           kWh/MT: Σ mill-power kWh ÷ Σ mill-power MT of the period (one day: the form's own figure);
 *   Hot billet (heater)  MT: Σ hot-billet MT — the form's "HOT BILLET PRD. (Running with Heater)", named short
 *                        for the card.
 * No limits or alerts (the user). Each opens the same drill-down on its own figure: per day / week / month,
 * with the cold-billet and mill blocks beside it.
 */
import { useMemo, useState } from 'react';
import KpiCard from '@/components/visualization/KpiCard';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox from '@/components/drill/SourceBox';
import { useDrillRange } from '@/components/drill/useDrillRange';
import { fixed } from '@/lib/num';
import { dm, useSelection } from '@/services/hsmProduction';
import { lastFigure, useLastEntry } from '@/services/lastEntry';
import { rangeUrl, useApi, type HsmHeaterPowerPeriod, type HsmHeaterPowerReport } from '@/services/hsmApi';

type View = 'mill' | 'hot';
const PATH = '/api/hsm/heater-power';
const FORM = 'HSM → Electrical HSM → Billet Heater Performance & Mill Power';
const f = (v: number | null, dp = 2) => (v === null ? '—' : fixed(v, dp));

export default function HsmHeaterPowerCards() {
  const { dates } = useSelection();
  const url = rangeUrl(PATH, dates ? { ...dates, grain: 'day' } : null);
  const s = useApi<HsmHeaterPowerReport>(url);
  const data = s.data && s.dataUrl === url ? s.data : null;
  const up = !!data && data.logbook.connection === 'up';
  /* No entry in the period: the last day the form has (the user, 30 Oct 2026). */
  const last = useLastEntry<HsmHeaterPowerReport>(PATH, up && data!.totals.entryDays === 0, data?.lastDate, dates?.from, 'grain=day');
  const [open, setOpen] = useState<View | null>(null);
  const t = data?.totals ?? null;
  const note = s.error ? 'Logbook unavailable' : data && !up ? data.logbook.message : '';
  const card = (k: 'millPowerKwhPerMt' | 'hotBilletMt', dp: number) => ({
    value: t?.[k] == null ? 'NA' : fixed(t[k]!, dp),
    noEntries: up && t?.[k] == null,
    lastEntry: lastFigure(t?.[k], last, (d) => d.totals[k], (n) => fixed(n, dp)),
    note, loading: !data && !s.error,
  });
  return (
    <>
      <KpiCard label="Mill power" unit="kWh/MT" series="prod" {...card('millPowerKwhPerMt', 1)}
        onOpen={() => setOpen('mill')} openLabel="Mill power per day, from the Billet Heater Performance & Mill Power form" />
      <KpiCard label="Hot billet (heater)" unit="MT" series="prod" {...card('hotBilletMt', 1)}
        onOpen={() => setOpen('hot')} openLabel="Hot billet production running with the heater, per day" />
      <HeaterPowerDrawer view={open} onClose={() => setOpen(null)} />
    </>
  );
}

const TITLES: Record<View, string> = { mill: 'Mill power', hot: 'Hot billet production (running with heater)' };

function HeaterPowerDrawer({ view, onClose }: { view: View | null; onClose: () => void }) {
  const r = useDrillRange(['selection'], 'selection');
  const url = view && r.dates ? rangeUrl(PATH, { ...r.dates, grain: r.grain }) : null;
  const { data, dataUrl, loading, error } = useApi<HsmHeaterPowerReport>(url);
  return (
    <DrillDrawer open={!!view} onClose={onClose} title={view ? TITLES[view] : ''} sub={view === 'hot' ? 'HSM · MT' : 'HSM · kWh/MT'}
      controls={r.controls} loading={loading} stale={!!data && dataUrl !== url} error={error} hasData={!!data}>
      {data && view && <Content data={data} view={view} />}
    </DrillDrawer>
  );
}

const label = (x: HsmHeaterPowerPeriod) => (
  <td><b>{x.label}</b>{x.days > 1 && x.key !== 'total' && <span className="pd-dim"> · {dm(x.fromDate)}–{dm(x.toDate)}</span>}</td>
);

/** One period: the card's figure first, then what it is worked out from (mill) or the cold billets beside it (hot). */
function Row({ x, mill }: { x: HsmHeaterPowerPeriod; mill: boolean }) {
  return mill ? (
    <tr>{label(x)}<td className="num r v-val"><b>{f(x.millPowerKwhPerMt)}</b></td><td className="num r">{f(x.millPowerKwh)}</td><td className="num r">{f(x.millPowerMt)}</td><td className="num r">{x.entryDays}</td></tr>
  ) : (
    <tr>{label(x)}<td className="num r v-val"><b>{f(x.hotBilletMt)}</b></td><td className="num r">{f(x.hotBilletKwhPerMt)}</td><td className="num r">{f(x.coldBilletMt)}</td><td className="num r">{f(x.coldBilletKwhPerMt)}</td><td className="num r">{x.entryDays}</td></tr>
  );
}

function Content({ data, view }: { data: HsmHeaterPowerReport; view: View }) {
  const { rows, totals: t } = data;
  const mill = view === 'mill';
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => (mill
    ? [{ id: 'mill', name: 'Mill power', token: '--s-prod', type: 'column', data: rows.map((x) => x.millPowerKwhPerMt), dp: 2 }]
    : [{ id: 'hot', name: 'Hot billet (heater)', token: '--s-prod', type: 'column', data: rows.map((x) => x.hotBilletMt), dp: 2 }]), [rows, mill]);
  const axes = useMemo(() => [mill ? { title: 'kWh/MT', unit: 'kWh/MT', min: 0 } : { title: 'MT', unit: 'MT', min: 0 }], [mill]);
  return (
    <>
      <Stats items={mill ? [
        { label: 'Mill power', value: f(t.millPowerKwhPerMt), unit: 'kWh/MT' },
        { label: 'Mill energy', value: f(t.millPowerKwh), unit: 'kWh' },
        { label: 'Mill production', value: f(t.millPowerMt), unit: 'MT' },
        { label: 'Days entered', value: String(t.entryDays), unit: `of ${t.days}` },
      ] : [
        { label: 'Hot billet (heater)', value: f(t.hotBilletMt), unit: 'MT' },
        { label: 'Heater power', value: f(t.hotBilletKwhPerMt), unit: 'kWh/MT' },
        { label: 'Cold billet', value: f(t.coldBilletMt), unit: 'MT' },
        { label: 'Days entered', value: String(t.entryDays), unit: `of ${t.days}` },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`${TITLES[view]} by period: ${rows.map((x) => `${x.label} ${f(mill ? x.millPowerKwhPerMt : x.hotBilletMt)}`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label={`${TITLES[view]} by period`}>
          <thead>{mill
            ? <tr><th>Period</th><th className="r">Mill power (kWh/MT)</th><th className="r">Mill energy (kWh)</th><th className="r">Mill production (MT)</th><th className="r">Days entered</th></tr>
            : <tr><th>Period</th><th className="r">Hot billet (MT)</th><th className="r">Hot billet (kWh/MT)</th><th className="r">Cold billet (MT)</th><th className="r">Cold billet (kWh/MT)</th><th className="r">Days entered</th></tr>}
          </thead>
          <tbody>{rows.map((x) => <Row key={x.key} x={x} mill={mill} />)}</tbody>
          <tfoot><Row x={t} mill={mill} /></tfoot>
        </table>
      </div>
      <SourceBox
        sources={[{ name: 'Logbook', rows: [['Form', FORM], ['Field', mill ? 'MILL POWER MT, KWH, KWH/MT — by the form\'s date' : 'HOT BILLET PRD. MT (running with heater), KWH, KWH/MT; COLD BILLET MT, KWH/MT — by the form\'s date']] }]}
        formula={mill ? [
          'Mill power = Σ MILL POWER KWH ÷ Σ MILL POWER MT over the days with both — one day: the form\'s own KWH/MT',
          'Entries remarked "test" are left out',
        ] : [
          'Hot billet (heater) = Σ HOT BILLET PRD. MT of the period\'s entries',
          'Entries remarked "test" are left out',
        ]}
      />
      {data.logbook.connection === 'down' && <p className="v-warn">{data.logbook.message}</p>}
    </>
  );
}
