'use client';

/**
 * Specific energy drill-down, for the period chosen on the dashboard: kWh per MT rolled —
 * the logbook's power over the Influx production — per day / week / month, as a line and a table, and
 * where both come from.
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from './DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from './DrillChart';
import SourceBox, { type SourceSystem } from './SourceBox';
import { useDrillRange } from './useDrillRange';
import { powerPeriods } from './powerPeriods';
import { dm } from '@/services/hsmProduction';
import type { Grain } from '@contracts';
import type { PowerMill } from './PowerDrawer';
import type { PowerReport } from '@/services/hsmApi';

export default function SpecificEnergyDrawer(props: {
  open: boolean; onClose: () => void; data: PowerReport | null; loading: boolean; error: string | null;
  mill?: PowerMill;
}) {
  const mill = props.mill ?? 'hsm';
  // The card's period; only the grouping is chosen here.
  const r = useDrillRange(['selection'], 'selection');
  return (
    <DrillDrawer
      open={props.open}
      onClose={props.onClose}
      title="Specific energy · power ÷ production"
      sub={`${mill.toUpperCase()} · kWh/MT`}
      controls={r.controls}
      loading={props.loading}
      error={props.error}
      hasData={!!props.data}
    >
      {props.data && <Content data={props.data} grain={r.grain} mill={mill} />}
    </DrillDrawer>
  );
}

function Content({ data, grain, mill }: { data: PowerReport; grain: Grain; mill: PowerMill }) {
  const t = data.totals;
  const rows = useMemo(() => powerPeriods(data.days, grain), [data.days, grain]);
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'se', name: 'Specific energy', token: '--s-prod', type: 'line', data: rows.map((x) => x.kwhPerMt), dp: 1 },
  ], [rows]);
  const axes = useMemo(() => [{ title: 'kWh/MT', unit: 'kWh/MT' }], []);
  const n = (v: number | null | undefined) => (v === null || v === undefined ? '—' : fmtNum(v, 1));

  return (
    <>
      <Stats items={[
        { label: 'Specific energy', value: n(t.kwhPerMt), unit: 'kWh/MT' },
        { label: 'Power', value: n(t.kwh), unit: 'kWh' },
        { label: mill === 'rmd' ? 'Production (ERP)' : 'Production (Influx)', value: n(t.productionMt), unit: 'MT' },
      ]} />

      {t.entries > 0 ? (
        <DrillChart
          series={series}
          categories={categories}
          axes={axes}
          ariaLabel={`Specific energy by period: ${rows.map((x) => `${x.label} ${n(x.kwhPerMt)} kWh/MT`).join('; ')}`}
        />
      ) : (
        <p className="pd-empty">No logbook entries for this period.</p>
      )}

      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Specific energy by period">
          <thead><tr><th>Period</th><th className="r">Power (kWh)</th><th className="r">Production (MT)</th><th className="r">Specific energy (kWh/MT)</th></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.key}>
                <td><b>{x.label}</b>{x.fromDate !== x.toDate && <span className="pd-dim"> · {dm(x.fromDate)}–{dm(x.toDate)}</span>}</td>
                <td className="num r">{n(x.kwh)}</td>
                <td className="num r">{n(x.productionMt)}</td>
                <td className="num r v-val"><b>{n(x.kwhPerMt)}</b></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td>Total</td><td className="num r">{n(t.kwh)}</td><td className="num r">{n(t.productionMt)}</td><td className="num r">{n(t.kwhPerMt)}</td></tr></tfoot>
        </table>
      </div>

      <SourceBox sources={SOURCES[mill]} formula={FORMULA[mill]} />
      {data.logbook.connection === 'down' && <p className="v-warn">{data.logbook.message}</p>}
    </>
  );
}

const SOURCES: Record<PowerMill, SourceSystem[]> = {
  hsm: [
    {
      name: 'Logbook',
      rows: [
        ['Form', 'Electrical HSM → Power Consumption'],
        ['Field', 'POWER_CONSUMED (kWh), all equipment, by the form\'s date'],
      ],
    },
    {
      name: 'Influx',
      rows: [
        ['Tag', 'Total_Production_Ton'],
        ['Filter', "_measurement = 'HSM', Unit = 'Finishing Mill', Group = 'General'"],
      ],
    },
  ],
  rmd: [
    {
      name: 'Logbook',
      rows: [
        ['Form', 'TMT Electrical Department → Power Reading VCB 1, VCB 2, VCB 3'],
        ['Field', 'ACTUAL_KWH_VCB_1, _2, _3 (kWh), by the form\'s date'],
      ],
    },
    {
      name: 'ERP',
      rows: [
        ['Table', 'ATTR_TRAN_DATA_BODY'],
        ['Filter', "USER_CODE = 'FA-SKJ'"],
        ['Field', "ATTR_CODE = 'PRODUCT_PRIME_SLENGTH_MT' (value in ATTR_VALUE), by VRDATE"],
      ],
    },
  ],
};

const FORMULA: Record<PowerMill, string[]> = {
  hsm: ['Specific energy = Power (kWh) ÷ Influx production (MT)'],
  rmd: ['Specific energy = Power (kWh) ÷ ERP production (MT)'],
};
