'use client';

/**
 * RMD production from the ERP Production Log Sheet, for the dashboard's period, per day /
 * week / month. Three views of the same data:
 *   production  production per period (Production card, Finished exit, Order allocation);
 *   yield       mass yield = production ÷ billet input (INPUT_MT) (Mass yield card);
 *   balance     billet input, production and where the rest went — the four losses (Material balance);
 *   performance Rolling in Casting %, Rolling in Delivery %, Plant Efficiency % — the Zoho TMT KPIs as
 *               the ERP log sheet holds them (the plant, 21 Nov 2026; the ERP is the source of truth).
 * Source, filters and codes exactly as the plant gave them (USER_CODE = 'FA-SKJ').
 */
import { useMemo } from 'react';
import { useLastEntry } from '@/services/lastEntry';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox, { type SourceSystem } from '@/components/drill/SourceBox';
import SectionsCell from '@/components/drill/SectionsCell';
import { useDrillRange } from '@/components/drill/useDrillRange';
import { dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmdProductionPeriod, type RmdProductionReport } from '@/services/hsmApi';

export type RmdProductionView = 'production' | 'yield' | 'balance' | 'performance' | 'coal' | BalanceKey;
/** The balance strip's bypasses and short length (the user, 25 Nov 2026): each its own drill-down. */
export type BalanceKey = 'ccmBypassMt' | 'millBypassMt' | 'shortLengthMt';
export const BALANCE: Record<BalanceKey, { name: string; field: string; token: string }> = {
  ccmBypassMt: { name: 'CCM bypass', field: 'CCM_BYPASS_MT', token: '--s-hold' },
  millBypassMt: { name: 'RMD bypass', field: 'MILL_BYPASS_MT', token: '--s-alt' },
  shortLengthMt: { name: 'Short length', field: 'FINISH_PRODUCT_SLENGTH_MT', token: '--s-order' },
};

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
      sub={view === 'yield' || view === 'performance' ? 'RMD · %' : 'RMD · MT'}
      controls={r.controls}
      loading={loading}
      stale={!!data && dataUrl !== url}
      error={error}
      hasData={!!data}
    >
      {data && (view === 'production' ? <ProductionContent data={data} /> : view === 'yield' ? <YieldContent data={data} />
        : view === 'performance' ? <PerformanceContent data={data} /> : view === 'coal' ? <CoalContent data={data} />
        : view in BALANCE ? <BalanceMetricContent data={data} k={view as BalanceKey} /> : <BalanceContent data={data} />)}
    </DrillDrawer>
  );
}

const TITLE: Record<RmdProductionView, string> = {
  production: 'Production · ERP log sheet',
  yield: 'Yield · ERP log sheet',
  balance: 'Material balance · ERP log sheet',
  performance: 'Rolling in casting, delivery and plant efficiency · ERP log sheet',
  coal: 'Coal consumption · ERP log sheet',
  ccmBypassMt: 'CCM bypass · ERP log sheet',
  millBypassMt: 'RMD bypass · ERP log sheet',
  shortLengthMt: 'Short length · ERP log sheet',
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
          <thead><tr><th>Period</th><th className="r">Prime + SL (MT)</th><th className="r">Prime (MT)</th><th>Size rolled (of Prime)</th></tr></thead>
          <tbody>{rows.map((x) => <tr key={x.key}>{label(x)}<td className="num r v-val">{f(x.productionMt)}</td><td className="num r v-val">{f(x.primeMt)}</td><SectionsCell sections={x.sections} /></tr>)}</tbody>
          <tfoot><tr>{label(t)}<td className="num r">{f(t.productionMt)}</td><td className="num r">{f(t.primeMt)}</td><SectionsCell sections={t.sections} /></tr></tfoot>
        </table>
      </div>
      <SourceBox
        sources={[...sources(['PRODUCT_PRIME_SLENGTH_MT', 'FINISH_PRODUCT_PRIME_MT']), { name: 'ERP', rows: [
          ['Table', 'PROD_TRAN (production receipts), ITEM_MAST (item name)'],
          ['Filter', "DIV_CODE = 'RM', finished items (ITEM_CODE 'F…'), not cancelled, miss roll left out; each tied to its log-sheet entry (REF_VRNO) for its rolling"],
          ['Size', 'read from the item name, as in Finished stock by size'],
        ] }]}
        formula={[
          "Prime + SL = Σ PRODUCT_PRIME_SLENGTH_MT of the date's entries",
          "Prime = Σ FINISH_PRODUCT_PRIME_MT of the date's entries",
          'Size rolled = the finished bars received for the entries, by size — they add up to Prime on most entries, not to Prime + SL',
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
    { id: 'yield', name: 'Mass yield (Prime + SL)', token: '--s-order', type: 'line', data: rows.map((x) => x.massYieldPct), dp: 2 },
    { id: 'prime', name: 'Prime yield', token: '--s-alt', type: 'line', data: rows.map((x) => x.primeYieldPct), dp: 2 },
  ], [rows]);
  const axes = useMemo(() => [{ title: '%', unit: '%' }], []);

  return (
    <>
      <Stats items={[
        { label: 'Mass yield (Prime + SL)', value: f(t.massYieldPct), unit: '%' },
        { label: 'Prime yield', value: f(t.primeYieldPct), unit: '%' },
        { label: 'Billet input', value: f(t.billetInputMt), unit: 'MT' },
        { label: 'Prime + SL', value: f(t.productionMt), unit: 'MT' },
        { label: 'Prime', value: f(t.primeMt), unit: 'MT' },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Yield by period: ${rows.map((x) => `${x.label} prime + SL ${f(x.massYieldPct)}%, prime ${f(x.primeYieldPct)}%`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Mass yield by period">
          <thead><tr><th>Period</th><th className="r">Billet input (MT)</th><th className="r">Prime + SL (MT)</th><th className="r">Mass yield (%)</th><th className="r">Prime (MT)</th><th className="r">Prime yield (%)</th></tr></thead>
          <tbody>{rows.map((x) => <YieldRow key={x.key} x={x} />)}</tbody>
          <tfoot><YieldRow x={t} /></tfoot>
        </table>
      </div>
      <SourceBox
        sources={sources(['INPUT_MT', 'PRODUCT_PRIME_SLENGTH_MT', 'FINISH_PRODUCT_PRIME_MT'])}
        formula={['Mass yield = PRODUCT_PRIME_SLENGTH_MT ÷ INPUT_MT × 100', 'Prime yield = FINISH_PRODUCT_PRIME_MT ÷ INPUT_MT × 100']}
      />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

/** Coal, Offline entries only (the user, 24 Nov 2026): MT and kg per MT of Prime + SL, per day. */
/** One balance figure per period, with the billet input beside it. */
function BalanceMetricContent({ data, k }: { data: RmdProductionReport; k: BalanceKey }) {
  const c = BALANCE[k];
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: k, name: c.name, token: c.token, type: 'column', data: rows.map((x) => x[k]), dp: 2 },
  ], [rows, k, c]);
  const axes = useMemo(() => [{ title: 'MT', unit: 'MT', min: 0 }], []);
  return (
    <>
      <Stats items={[
        { label: c.name, value: f(t[k]), unit: 'MT' },
        { label: 'Billet input', value: f(t.billetInputMt), unit: 'MT' },
        { label: 'Days entered', value: String(t.entryDays), unit: `of ${t.days}` },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`${c.name} by period: ${rows.map((x) => `${x.label} ${f(x[k])} MT`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label={`${c.name} by period`}>
          <thead><tr><th>Period</th><th className="r">{c.name} (MT)</th><th className="r">Billet input (MT)</th></tr></thead>
          <tbody>{rows.map((x) => <BalanceMetricRow key={x.key} x={x} k={k} />)}</tbody>
          <tfoot><BalanceMetricRow x={t} k={k} /></tfoot>
        </table>
      </div>
      <SourceBox sources={sources([c.field, 'INPUT_MT'])} formula={[`${c.name} = Σ ${c.field} of the period's entries, for the Rolling chosen`]} />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

function BalanceMetricRow({ x, k }: { x: RmdProductionPeriod; k: BalanceKey }) {
  return (
    <tr>
      {label(x)}
      <td className="num r v-val"><b>{f(x[k])}</b></td>
      <td className="num r">{f(x.billetInputMt)}</td>
    </tr>
  );
}

function CoalContent({ data }: { data: RmdProductionReport }) {
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'coal', name: 'Coal (kg/MT)', token: '--s-alt', type: 'column', data: rows.map((x) => x.coalKgPerMt), dp: 2 },
  ], [rows]);
  const axes = useMemo(() => [{ title: 'kg/MT', unit: 'kg/MT' }], []);
  return (
    <>
      <Stats items={[
        { label: 'Coal consumption', value: f(t.coalKgPerMt), unit: 'kg/MT' },
        { label: 'Coal', value: f(t.coalMt), unit: 'MT' },
        { label: 'Prime + SL', value: f(t.productionMt), unit: 'MT' },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Coal consumption by period: ${rows.map((x) => `${x.label} ${f(x.coalKgPerMt)} kg/MT`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Coal consumption by period">
          <thead><tr><th>Period</th><th className="r">Coal (MT)</th><th className="r">Prime + SL (MT)</th><th className="r">Coal (kg/MT)</th></tr></thead>
          <tbody>{rows.map((x) => <CoalRow key={x.key} x={x} />)}</tbody>
          <tfoot><CoalRow x={t} /></tfoot>
        </table>
      </div>
      <SourceBox
        sources={sources(['TOTAL_COAL_CONSUMPTION', 'COAL_CONSUMPTION_KGMT', 'PRODUCT_PRIME_SLENGTH_MT'])}
        formula={[
          'Offline entries only (ATTR_TRAN_DATA_HEAD.TRAN_COLUMN_NAME1 = RO002)',
          'Coal (kg/MT) = Σ TOTAL_COAL_CONSUMPTION × 1000 ÷ Σ PRODUCT_PRIME_SLENGTH_MT — one entry: the ERP\'s COAL_CONSUMPTION_KGMT',
        ]}
      />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

function CoalRow({ x }: { x: RmdProductionPeriod }) {
  return (
    <tr>
      {label(x)}
      <td className="num r">{f(x.coalMt)}</td>
      <td className="num r">{f(x.productionMt)}</td>
      <td className="num r v-val"><b>{f(x.coalKgPerMt)}</b></td>
    </tr>
  );
}

function YieldRow({ x }: { x: RmdProductionPeriod }) {
  return (
    <tr>
      {label(x)}
      <td className="num r">{f(x.billetInputMt)}</td>
      <td className="num r">{f(x.productionMt)}</td>
      <td className="num r v-val"><b>{f(x.massYieldPct)}</b></td>
      <td className="num r">{f(x.primeMt)}</td>
      <td className="num r v-val"><b>{f(x.primeYieldPct)}</b></td>
    </tr>
  );
}

function PerformanceContent({ data }: { data: RmdProductionReport }) {
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'casting', name: 'Rolling in casting', token: '--s-prod', type: 'column', data: rows.map((x) => x.rollingInCastingPct), dp: 2 },
    { id: 'delivery', name: 'Rolling in delivery', token: '--s-order', type: 'column', data: rows.map((x) => x.rollingInDeliveryPct), dp: 2 },
    { id: 'efficiency', name: 'Plant efficiency', token: '--s-pred', type: 'column', data: rows.map((x) => x.plantEfficiencyPct), dp: 2 },
  ], [rows]);
  const axes = useMemo(() => [{ title: '%', unit: '%' }], []);

  return (
    <>
      <Stats items={[
        { label: 'Rolling in casting', value: f(t.rollingInCastingPct), unit: '%' },
        { label: 'Rolling in delivery', value: f(t.rollingInDeliveryPct), unit: '%' },
        { label: 'Plant efficiency', value: f(t.plantEfficiencyPct), unit: '%' },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Rolling performance by period: ${rows.map((x) => `${x.label} casting ${f(x.rollingInCastingPct)}%, delivery ${f(x.rollingInDeliveryPct)}%, efficiency ${f(x.plantEfficiencyPct)}%`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Rolling performance by period">
          <thead><tr><th>Period</th><th className="r">Rolling in casting (%)</th><th className="r">Rolling in delivery (%)</th><th className="r">Plant efficiency (%)</th><th className="r">Prime + SL (MT)</th><th className="r">Target (MT)</th></tr></thead>
          <tbody>{rows.map((x) => <PerformanceRow key={x.key} x={x} />)}</tbody>
          <tfoot><PerformanceRow x={t} /></tfoot>
        </table>
      </div>
      <SourceBox
        sources={sources(['ROLLING_IN_TOTAL_PERCENTAGE', 'ROLLING_IN_DELIVERY_PRCNT', 'PLANT_EFFICIENCY', 'PRODUCT_PRIME_SLENGTH_MT', 'PRODUCTION_TARGET', 'INPUT_MT'])}
        formula={[
          'Rolling in casting = ROLLING_IN_TOTAL_PERCENTAGE of each entry; over several entries, their average weighted by INPUT_MT',
          'Rolling in delivery = ROLLING_IN_DELIVERY_PRCNT of each entry; over several entries, their average weighted by INPUT_MT',
          'Plant efficiency = PLANT_EFFICIENCY of each entry (the ERP\'s: performance × availability — production ÷ target, less any breakdown time); over several entries, their average weighted by PRODUCTION_TARGET',
          'Target is the ERP\'s, used to weight efficiency only — the production plan is the one filled on the dashboard',
        ]}
      />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

function PerformanceRow({ x }: { x: RmdProductionPeriod }) {
  return (
    <tr>
      {label(x)}
      <td className="num r v-val">{f(x.rollingInCastingPct)}</td>
      <td className="num r v-val">{f(x.rollingInDeliveryPct)}</td>
      <td className="num r v-val">{f(x.plantEfficiencyPct)}</td>
      <td className="num r">{f(x.productionMt)}</td>
      <td className="num r">{f(x.targetMt)}</td>
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
