'use client';

/**
 * Specific energy drill-down, for the period chosen on the dashboard: kWh per MT rolled —
 * the logbook's power over the ERP production — per day / week / month, as a line and a table, and
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
import { rmdErpPowerSources, type PowerMill } from './PowerDrawer';
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
  // RMS: over prime production, the days with both figures (the user, 26 Nov 2026).
  const prime = data.basis === 'prime';
  const rows = useMemo(() => powerPeriods(data.days, grain, prime), [data.days, grain, prime]);
  const prodName = prime ? 'Prime production' : 'Production';
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
        { label: 'Power', value: n(prime ? t.pairedKwh : t.kwh), unit: 'kWh', title: prime ? 'The days with both power and prime production' : undefined },
        { label: `${prodName} (ERP)`, value: n(t.productionMt), unit: 'MT', title: prime ? 'The days with both power and prime production' : undefined },
      ]} />

      {t.entries > 0 ? (
        <DrillChart
          series={series}
          categories={categories}
          axes={axes}
          ariaLabel={`Specific energy by period: ${rows.map((x) => `${x.label} ${n(x.kwhPerMt)} kWh/MT`).join('; ')}`}
        />
      ) : (
        <p className="pd-empty">{data.erpMode ? 'No ERP entries for this period.' : 'No logbook entries for this period.'}</p>
      )}

      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Specific energy by period">
          <thead><tr><th>Period</th><th className="r">Power (kWh)</th><th className="r">{prodName} (MT)</th><th className="r">Specific energy (kWh/MT)</th></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.key}>
                <td><b>{x.label}</b>{x.fromDate !== x.toDate && <span className="pd-dim"> · {dm(x.fromDate)}–{dm(x.toDate)}</span>}</td>
                <td className="num r">{n(prime ? x.pairedKwh : x.kwh)}</td>
                <td className="num r">{n(x.productionMt)}</td>
                <td className="num r v-val"><b>{n(x.kwhPerMt)}</b></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td>Total</td><td className="num r">{n(prime ? t.pairedKwh : t.kwh)}</td><td className="num r">{n(t.productionMt)}</td><td className="num r">{n(t.kwhPerMt)}</td></tr></tfoot>
        </table>
      </div>

      {data.erpMode
        ? <SourceBox sources={rmdErpPowerSources(data.erpMode)} formula={['Specific energy = Σ TOTAL_POWER_CONSUMPTION (kWh) ÷ Σ PRODUCT_PRIME_SLENGTH_MT (MT), the same entries']} />
        : <SourceBox sources={SOURCES[mill]} formula={FORMULA[mill]} />}
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
      name: 'ERP',
      rows: [
        ['Table', 'ATTR_TRAN_DATA_HEAD / BODY, TNATURE PRLOG, series L6P (division S1)'],
        ['Field', 'PRODUCTION_MT, by VRDATE'],
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
  ],  lsm: [
    {
      name: 'Logbook',
      rows: [
        ['Form', 'Electrical Logbook → Daily Power Consumption Record'],
        ['Field', 'ACTUAL_KWH_VCB_1_1250AMP (kWh), by the form\'s date'],
      ],
    },
    {
      name: 'ERP',
      rows: [
        ['Table', 'ATTR_TRAN_DATA_BODY'],
        ['Filter', "USER_CODE = 'FA-LP-P'"],
        ['Field', "ATTR_CODE = 'PRODUTION_MT' (value in ATTR_VALUE), by VRDATE"],
      ],
    },
  ],
  rms: [
    {
      name: 'Logbook',
      rows: [
        ['Form', 'RMS Electrical Logbook → Daily Power Consumption Record'],
        ['Field', 'TOTAL RMS ACTUAL POWER KWH, by the form\'s date'],
      ],
    },
    {
      name: 'ERP',
      rows: [
        ['Table', 'ATTR_TRAN_DATA_HEAD + ATTR_TRAN_DATA_BODY'],
        ['Filter', "ENTITY_CODE = 'MP', DIV_CODE = 'RS', TNATURE = 'PRLOG', SERIES = 'L5P'"],
        ['Field', "ATTR_CODE = 'PRIME_MT1' + 'PRIME_MT2' (value in ATTR_VALUE), by VRDATE"],
      ],
    },
  ],
};

const FORMULA: Record<PowerMill, string[]> = {
  hsm: ['Specific energy = Power (kWh) ÷ ERP production (MT)'],
  rmd: ['Specific energy = Power (kWh) ÷ ERP production (MT)'],
  lsm: ['Specific energy = Power (kWh) ÷ ERP production (MT)'],
  rms: ['Specific energy = RMS power (kWh) ÷ Prime production (MT)'],
};
