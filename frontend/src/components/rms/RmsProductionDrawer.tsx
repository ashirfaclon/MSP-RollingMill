'use client';

/**
 * RMS production from the ERP Production Log Sheet (division RS, series L5P) — HSM's sheet and
 * field with RMS's division — for the dashboard's period, per day / week / month. A day entered
 * twice with identical figures counts once.
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import DrillChart, { fmtNum, type DrillSeries } from '@/components/drill/DrillChart';
import SourceBox from '@/components/drill/SourceBox';
import { useDrillRange } from '@/components/drill/useDrillRange';
import { dm } from '@/services/hsmProduction';
import { rangeUrl, useApi, type RmsProductionPeriod, type RmsProductionReport } from '@/services/hsmApi';

const f = (v: number | null) => (v === null ? '—' : fmtNum(v, 2));

/** The Duration period's RMS production report (day grain) — shared by the card and Order allocation. */
export function useRmsProduction(dates: { from: string; to: string } | null) {
  const url = rangeUrl('/api/rms/production', dates ? { ...dates, grain: 'day' } : null);
  const s = useApi<RmsProductionReport>(url);
  return { data: s.data && s.dataUrl === url ? s.data : null, error: s.error };
}

export default function RmsProductionDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const r = useDrillRange(['selection'], 'selection');
  const url = open && r.dates ? rangeUrl('/api/rms/production', { ...r.dates, grain: r.grain }) : null;
  const { data, dataUrl, loading, error } = useApi<RmsProductionReport>(url);
  return (
    <DrillDrawer open={open} onClose={onClose} title="Production · ERP log sheet" sub="RMS · MT" controls={r.controls}
      loading={loading} stale={!!data && dataUrl !== url} error={error} hasData={!!data}>
      {data && <Content data={data} />}
    </DrillDrawer>
  );
}

const label = (x: RmsProductionPeriod) => (
  <td><b>{x.label}</b>{x.days > 1 && x.key !== 'total' && <span className="pd-dim"> · {dm(x.fromDate)}–{dm(x.toDate)}</span>}</td>
);

function Content({ data }: { data: RmsProductionReport }) {
  const rows = data.rows;
  const t = data.totals;
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'prod', name: 'Production', token: '--s-prod', type: 'column', data: rows.map((x) => x.productionMt), dp: 2 },
  ], [rows]);
  const axes = useMemo(() => [{ title: 'MT', unit: 'MT' }], []);
  return (
    <>
      <Stats items={[
        { label: 'Production', value: f(t.productionMt), unit: 'MT' },
        { label: 'Days entered', value: String(t.entryDays), unit: `of ${t.days}` },
      ]} />
      <DrillChart series={series} categories={categories} axes={axes}
        ariaLabel={`Production by period: ${rows.map((x) => `${x.label} ${f(x.productionMt)} MT`).join('; ')}`} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Production by period">
          <thead><tr><th>Period</th><th className="r">Production (MT)</th></tr></thead>
          <tbody>{rows.map((x) => <tr key={x.key}>{label(x)}<td className="num r v-val">{f(x.productionMt)}</td></tr>)}</tbody>
          <tfoot><tr>{label(t)}<td className="num r">{f(t.productionMt)}</td></tr></tfoot>
        </table>
      </div>
      <SourceBox
        sources={[{ name: 'ERP', rows: [
          ['Table', 'ATTR_TRAN_DATA_HEAD + ATTR_TRAN_DATA_BODY'],
          ['Filter', "ENTITY_CODE = 'MP', DIV_CODE = 'RS', TNATURE = 'PRLOG', SERIES = 'L5P'"],
          ['Field', "ATTR_CODE = 'PRODUCTION_MT' (value in ATTR_VALUE), by VRDATE"],
        ] }]}
        formula={[
          "Production = Σ PRODUCTION_MT of the date's entries",
          'An entry repeating another of its date (same PRODUCTION_MT and PRODUCTION_PCS) counts once',
        ]}
      />
      {data.erp.connection === 'down' && <p className="v-warn">{data.erp.message}</p>}
    </>
  );
}
