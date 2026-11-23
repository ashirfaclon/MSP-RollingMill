'use client';

/**
 * HSM: cast, delivery, input, production and prime of the Rolling chosen in the top bar, the two rolling
 * percentages (Online entries) and cold power (Offline entries), per day / week / month — the plant's
 * management KPIs from the ERP Production Log Sheet (HSM.xlsx, the user, 23 Nov 2026).
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from './DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from './DrillChart';
import SourceBox from './SourceBox';
import { useDrillRange } from './useDrillRange';
import { dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type HsmRollingPeriod, type HsmRollingReport } from '@/services/hsmApi';
import { RMD_MODE_LABELS, useGlobalSel } from '@/state/globalSel';

const f = (v: number | null, dp = 2) => (v === null ? '—' : fmtNum(v, dp));

export default function HsmRollingDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mode = useGlobalSel().rmdMode;
  const r = useDrillRange(['selection'], 'selection');
  const url = open && r.dates ? rangeUrl('/api/hsm/rolling', { ...r.dates, grain: r.grain }) : null;
  const { data, dataUrl, loading, error } = useApi<HsmRollingReport>(url);
  return (
    <DrillDrawer open={open} onClose={onClose} title="Cast, delivery and rolling · ERP log sheet"
      sub={`HSM · ${mode === 'all' ? 'Online + Offline' : RMD_MODE_LABELS[mode]}`}
      controls={r.controls} loading={loading} stale={!!data && dataUrl !== url} error={error} hasData={!!data}>
      {data && <Content data={data} />}
    </DrillDrawer>
  );
}

function Content({ data }: { data: HsmRollingReport }) {
  const rows = data.rows;
  const t = data.totals;
  const showRolling = data.mode !== 'offline';
  const showCold = data.mode !== 'online';
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'cast', name: 'Cast qty', token: '--s-alt', type: 'column', data: rows.map((x) => x.castMt), dp: 2 },
    { id: 'delivery', name: 'Delivery', token: '--s-order', type: 'column', data: rows.map((x) => x.deliveryMt), dp: 2 },
    { id: 'prod', name: 'Production', token: '--s-prod', type: 'column', data: rows.map((x) => x.productionMt), dp: 2 },
  ], [rows]);
  const axes = useMemo(() => [{ title: 'MT', unit: 'MT' }], []);
  return (
    <>
      <Stats items={[
        { label: 'Cast qty', value: f(t.castMt), unit: 'MT' },
        { label: 'Delivery', value: f(t.deliveryMt), unit: 'MT' },
        { label: 'Production', value: f(t.productionMt), unit: 'MT' },
        { label: 'Prime qty', value: f(t.primeMt), unit: 'MT' },
        ...(showRolling ? [
          { label: 'Rolling w.r.t. casting', value: f(t.rollingInCastingPct), unit: '%' },
          { label: 'Rolling w.r.t. delivery', value: f(t.rollingInDeliveryPct), unit: '%' },
        ] : []),
        ...(showCold ? [
          { label: 'Cold power', value: f(t.coldPowerKwh, 0), unit: 'kWh' },
          { label: 'Cold power per tonne', value: f(t.coldPowerKwhPerMt), unit: 'kWh/MT' },
        ] : []),
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Cast, delivery and production by period: ${rows.map((x) => `${x.label} cast ${f(x.castMt)}, delivery ${f(x.deliveryMt)}, production ${f(x.productionMt)} MT`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Cast, delivery and rolling by period">
          <thead><tr>
            <th>Period</th><th className="r">Cast (MT)</th><th className="r">Delivery (MT)</th><th className="r">Billet input (MT)</th>
            <th className="r">Production (MT)</th><th className="r">Prime (MT)</th>
            {showRolling && <><th className="r">Rolling w.r.t. casting (%)</th><th className="r">Rolling w.r.t. delivery (%)</th></>}
            {showCold && <><th className="r">Cold power (kWh)</th><th className="r">Cold power (kWh/MT)</th></>}
          </tr></thead>
          <tbody>{rows.map((x) => <Row key={x.key} x={x} showRolling={showRolling} showCold={showCold} />)}</tbody>
          <tfoot><Row x={t} showRolling={showRolling} showCold={showCold} /></tfoot>
        </table>
      </div>
      <SourceBox
        sources={[{ name: 'ERP', rows: [
          ['Table', 'ATTR_TRAN_DATA_HEAD ⋈ ATTR_TRAN_DATA_BODY'],
          ['Filter', "ENTITY 'MP' · DIV 'S1' · TNATURE 'PRLOG' · SERIES 'L6P'"],
          ['Rolling', 'TRAN_COLUMN_NAME1: ST001 = Online, ST002 = Offline (cold rolling)'],
          ['Field', "ATTR_CODE = 'TOTAL_CAST_QTY', 'DELIVERY_QTY', 'INPUT_MT', 'PRODUCTION_MT', 'PRIME_MT', 'POWER_CONSUMPTION_IN_KWH' (value in ATTR_VALUE)"],
          ['Date', 'VRDATE — a date with several entries adds them'],
        ] }]}
        formula={[
          'Cast, delivery, input, production, prime = Σ over the chosen rolling\'s entries (Both adds Online and Offline)',
          'Rolling w.r.t. casting = Σ INPUT_MT ÷ Σ TOTAL_CAST_QTY × 100, Online entries only (one entry: the ERP\'s ROLLING_PERCENTAGE_CASTING)',
          'Rolling w.r.t. delivery = Σ INPUT_MT ÷ Σ DELIVERY_QTY × 100, Online entries only (one entry: the ERP\'s ROLLING_PERCENTAGE_DELIVERY)',
          'Cold power = Σ POWER_CONSUMPTION_IN_KWH of the Offline entries; per tonne ÷ their Σ PRODUCTION_MT',
        ]}
      />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}

function Row({ x, showRolling, showCold }: { x: HsmRollingPeriod; showRolling: boolean; showCold: boolean }) {
  return (
    <tr>
      <td><b>{x.label}</b>{x.days > 1 && x.key !== 'total' && <span className="pd-dim"> · {dm(x.fromDate)}–{dm(x.toDate)}</span>}</td>
      <td className="num r">{f(x.castMt)}</td>
      <td className="num r">{f(x.deliveryMt)}</td>
      <td className="num r">{f(x.inputMt)}</td>
      <td className="num r v-val">{f(x.productionMt)}</td>
      <td className="num r">{f(x.primeMt)}</td>
      {showRolling && <><td className="num r v-val">{f(x.rollingInCastingPct)}</td><td className="num r v-val">{f(x.rollingInDeliveryPct)}</td></>}
      {showCold && <><td className="num r">{f(x.coldPowerKwh, 0)}</td><td className="num r">{f(x.coldPowerKwhPerMt)}</td></>}
    </tr>
  );
}
