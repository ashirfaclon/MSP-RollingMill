'use client';

/**
 * RMD production from the ERP Production Log Sheet, for the dashboard's period, per day /
 * week / month. Three views of the same data:
 *   production  production per period (Production card, Finished exit, Order allocation);
 *   yield       mass yield = production ÷ billet input (INPUT_MT) (Mass yield card);
 *   balance     billet input, production and where the rest went — the four losses (Material balance).
 * Source, filters and codes exactly as the plant gave them (USER_CODE = 'FA-SKJ').
 */
import { useMemo } from 'react';
import { useLastEntry } from '@/services/lastEntry';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox, { type SourceSystem } from '@/components/drill/SourceBox';
import { useDrillRange } from '@/components/drill/useDrillRange';
import { dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmdProductionPeriod, type RmdProductionReport } from '@/services/hsmApi';

export type RmdProductionView = 'production' | 'yield' | 'balance';

const f = (v: number | null) => (v === null ? '—' : fmtNum(v, 2));

/** The Duration period's RMD production report (day grain) — shared by the cards and panels. */
export function useRmdProduction(dates: { from: string; to: string } | null) {
  const url = rangeUrl('/api/rmd/production', dates ? { ...dates, grain: 'day' } : null);
  const s = useApi<RmdProductionReport>(url);
  const data = s.data && s.dataUrl === url ? s.data : null;
  /* No ERP entry in the period: the last day the log sheet has (the user, 30 Oct 2026). */
  const last = useLastEntry<RmdProductionReport>('/api/rmd/production', !!data && data.erp.connection === 'up' && data.totals.entryDays === 0, data?.erp.lastDate, dates?.from, 'grain=day');
  return { data, error: s.error, last };
}

export default function RmdProductionDrawer({ open, onClose, view }: { open: boolean; onClose: () => void; view: RmdProductionView }) {
  const r = useDrillRange(['selection'], 'selection');
  const url = open && r.dates ? rangeUrl('/api/rmd/production', { ...r.dates, grain: r.grain }) : null;
  const { data, dataUrl, loading, error } = useApi<RmdProductionReport>(url);
  return (
    <DrillDrawer
      open={open}
      onClose={onClose}
      title={TITLE[view]}
      sub={view === 'yield' ? 'RMD · %' : 'RMD · MT'}
      controls={r.controls}
      loading={loading}
      stale={!!data && dataUrl !== url}
      error={error}
      hasData={!!data}
    >
      {data && (view === 'production' ? <ProductionContent data={data} /> : view === 'yield' ? <YieldContent data={data} /> : <BalanceContent data={data} />)}
    </DrillDrawer>
  );
}

const TITLE: Record<RmdProductionView, string> = {
  production: 'Production · ERP log sheet',
  yield: 'Mass yield · ERP log sheet',
  balance: 'Material balance · ERP log sheet',
};

const label = (x: RmdProductionPeriod) => (
  <td><b>{x.label}</b>{x.days > 1 && x.key !== 'total' && <span className="pd-dim"> · {dm(x.fromDate)}–{dm(x.toDate)}</span>}</td>
);

function ProductionContent({ data }: { data: RmdProductionReport }) {
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'prod', name: 'Prime + SL', token: '--s-prod', type: 'column', data: rows.map((x) => x.productionMt), dp: 2 },
    { id: 'prime', name: 'Prime', token: '--s-alt', type: 'column', data: rows.map((x) => x.primeMt), dp: 2 },
  ], [rows]);
  const axes = useMemo(() => [{ title: 'MT', unit: 'MT' }], []);

  return (
    <>
      <Stats items={[
        { label: 'Prime + SL', value: f(t.productionMt), unit: 'MT' },
        { label: 'Prime', value: f(t.primeMt), unit: 'MT' },
        { label: 'Days entered', value: String(t.entryDays), unit: `of ${t.days} · to ${dm(data.erp.lastDate)}` },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Production by period: ${rows.map((x) => `${x.label} prime + SL ${f(x.productionMt)} MT, prime ${f(x.primeMt)} MT`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Production by period">
          <thead><tr><th>Period</th><th className="r">Prime + SL (MT)</th><th className="r">Prime (MT)</th></tr></thead>
          <tbody>{rows.map((x) => <tr key={x.key}>{label(x)}<td className="num r v-val">{f(x.productionMt)}</td><td className="num r v-val">{f(x.primeMt)}</td></tr>)}</tbody>
          <tfoot><tr>{label(t)}<td className="num r">{f(t.productionMt)}</td><td className="num r">{f(t.primeMt)}</td></tr></tfoot>
        </table>
      </div>
      <SourceBox
        sources={sources(['PRODUCT_PRIME_SLENGTH_MT', 'FINISH_PRODUCT_PRIME_MT'])}
        formula={[
          "Prime + SL = Σ PRODUCT_PRIME_SLENGTH_MT of the date's entries",
          "Prime = Σ FINISH_PRODUCT_PRIME_MT of the date's entries",
        ]}
      />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

function YieldContent({ data }: { data: RmdProductionReport }) {
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'yield', name: 'Mass yield', token: '--s-order', type: 'line', data: rows.map((x) => x.massYieldPct), dp: 2 },
  ], [rows]);
  const axes = useMemo(() => [{ title: '%', unit: '%' }], []);

  return (
    <>
      <Stats items={[
        { label: 'Mass yield', value: f(t.massYieldPct), unit: '%' },
        { label: 'Billet input', value: f(t.billetInputMt), unit: 'MT' },
        { label: 'Prime + SL', value: f(t.productionMt), unit: 'MT' },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Mass yield by period: ${rows.map((x) => `${x.label} ${f(x.massYieldPct)}%`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Mass yield by period">
          <thead><tr><th>Period</th><th className="r">Billet input (MT)</th><th className="r">Prime + SL (MT)</th><th className="r">Mass yield (%)</th></tr></thead>
          <tbody>{rows.map((x) => <YieldRow key={x.key} x={x} />)}</tbody>
          <tfoot><YieldRow x={t} /></tfoot>
        </table>
      </div>
      <SourceBox
        sources={sources(['INPUT_MT', 'PRODUCT_PRIME_SLENGTH_MT'])}
        formula={['Mass yield = PRODUCT_PRIME_SLENGTH_MT ÷ INPUT_MT × 100']}
      />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

function YieldRow({ x }: { x: RmdProductionPeriod }) {
  return (
    <tr>
      {label(x)}
      <td className="num r">{f(x.billetInputMt)}</td>
      <td className="num r">{f(x.productionMt)}</td>
      <td className="num r v-val"><b>{f(x.massYieldPct)}</b></td>
    </tr>
  );
}

function BalanceContent({ data }: { data: RmdProductionReport }) {
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => {
    const col = (id: string, name: string, token: string, pick: (x: RmdProductionPeriod) => number | null): DrillSeries =>
      ({ id, name, token, type: 'column', stack: 'loss', data: rows.map(pick), dp: 2 });
    return [
      col('bloss', 'Burning loss', '--s-pred', (x) => x.burningLossMt),
      col('endcut', 'End cut', '--s-alt', (x) => x.endCutMt),
      col('missroll', 'Miss-roll', '--violet', (x) => x.missRollMt),
      col('chipoff', 'Chip off', '--risk', (x) => x.chipOffMt),
    ];
  }, [rows]);
  const axes = useMemo(() => [{ title: 'MT', unit: 'MT' }], []);

  return (
    <>
      <Stats items={[
        { label: 'Billet input', value: f(t.billetInputMt), unit: 'MT' },
        { label: 'Finished', value: f(t.productionMt), unit: 'MT' },
        { label: 'Mass difference', value: f(t.massDiffMt), unit: 'MT' },
        { label: 'Losses', value: f(t.lossesMt), unit: 'MT' },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Losses by period: ${rows.map((x) => `${x.label} ${f(x.lossesMt)} MT`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Material balance by period">
          <thead><tr><th>Period</th><th className="r">Billet input</th><th className="r">Finished</th><th className="r">Burning loss</th><th className="r">End cut</th><th className="r">Miss-roll</th><th className="r">Chip off</th><th className="r">Losses</th></tr></thead>
          <tbody>{rows.map((x) => <BalanceRow key={x.key} x={x} />)}</tbody>
          <tfoot><BalanceRow x={t} /></tfoot>
        </table>
      </div>
      <SourceBox
        sources={sources(['INPUT_MT', 'PRODUCT_PRIME_SLENGTH_MT', 'BLOSS_MT', 'ENDCUT_MT', 'MISROLL_MT', 'CHIP_OFF_MT'])}
        formula={[
          'Mass difference = INPUT_MT − PRODUCT_PRIME_SLENGTH_MT',
          'Losses = BLOSS_MT + ENDCUT_MT + MISROLL_MT + CHIP_OFF_MT',
        ]}
      />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

function BalanceRow({ x }: { x: RmdProductionPeriod }) {
  return (
    <tr>
      {label(x)}
      <td className="num r">{f(x.billetInputMt)}</td>
      <td className="num r v-val">{f(x.productionMt)}</td>
      <td className="num r">{f(x.burningLossMt)}</td>
      <td className="num r">{f(x.endCutMt)}</td>
      <td className="num r">{f(x.missRollMt)}</td>
      <td className="num r">{f(x.chipOffMt)}</td>
      <td className="num r v-val"><b>{f(x.lossesMt)}</b></td>
    </tr>
  );
}

const sources = (codes: string[]): SourceSystem[] => [{
  name: 'ERP',
  rows: [
    ['Table', 'ATTR_TRAN_DATA_BODY'],
    ['Filter', "USER_CODE = 'FA-SKJ'"],
    ['Field', `ATTR_CODE = ${codes.map((c) => `'${c}'`).join(', ')} (value in ATTR_VALUE)`],
    ['Date', 'VRDATE — a date with two entries adds both'],
  ],
}];
