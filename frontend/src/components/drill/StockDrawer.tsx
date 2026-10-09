'use client';

/**
 * Finished stock drill-down — how the stock in the finished-goods yard moved over the
 * dashboard's period, per day / week / month: what came in, what went out, and the stock at
 * the end of each. Then where it comes from. Opened from the Free stock card, the Order
 * allocation panel's Finished stock and the stock-by-size panel (all the same figure).
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from './DrillDrawer';
import DrillChart, { fmtNum, type DrillAxis, type DrillSeries } from './DrillChart';
import SourceBox, { type SourceSystem } from './SourceBox';
import { useDrillRange } from './useDrillRange';
import { groupDays } from '@/lib/periods';
import { dm } from '@/services/hsmProduction';
import type { Grain } from '@contracts';
import type { StockReport } from '@/services/hsmApi';

const AXES: DrillAxis[] = [
  { title: 'Stock (MT)', unit: 'MT' },
  { title: 'Moved (MT)', unit: 'MT', opposite: true, min: 0 },
];

const f = (v: number | null | undefined) => (v === null || v === undefined ? '—' : fmtNum(v, 1));

export default function StockDrawer(props: {
  open: boolean; onClose: () => void; data: StockReport | null; loading: boolean; error: string | null;
}) {
  // The dashboard's period; only the grouping is chosen here.
  const r = useDrillRange(['selection'], 'selection');
  return (
    <DrillDrawer
      open={props.open}
      onClose={props.onClose}
      title="Finished stock · ERP"
      sub="HSM · finished-goods yard · MT"
      controls={r.controls}
      loading={props.loading}
      error={props.error}
      hasData={!!props.data}
    >
      {props.data && r.dates && <Content data={props.data} from={r.dates.from} to={r.dates.to} grain={r.grain} />}
    </DrillDrawer>
  );
}

function Content({ data, from, to, grain }: { data: StockReport; from: string; to: string; grain: Grain }) {
  const days = useMemo(() => data.daily.filter((d) => d.date >= from && d.date <= to), [data.daily, from, to]);
  const rows = useMemo(() => groupDays(days, grain).map((g) => ({
    key: g.key, label: g.label, fromDate: g.fromDate, toDate: g.toDate,
    inMt: g.days.reduce((a, d) => a + d.inMt, 0),
    outMt: g.days.reduce((a, d) => a + d.outMt, 0),
    // A balance, not a sum: the stock at the end of the period's last day.
    stockMt: g.days[g.days.length - 1].stockMt,
  })), [days, grain]);
  const inMt = days.reduce((a, d) => a + d.inMt, 0);
  const outMt = days.reduce((a, d) => a + d.outMt, 0);
  const categories = useMemo(() => rows.map((x) => x.label), [rows]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'in', name: 'Received', token: '--s-prod', type: 'column', axis: 1, data: rows.map((x) => x.inMt || null), dp: 1 },
    { id: 'out', name: 'Issued', token: '--s-order', type: 'column', axis: 1, data: rows.map((x) => x.outMt || null), dp: 1 },
    { id: 'stock', name: 'Stock at end', token: '--s-free', type: 'line', data: rows.map((x) => x.stockMt), dp: 1 },
  ], [rows]);

  return (
    <>
      <Stats items={[
        { label: `Stock at end of ${dm(data.asOf)}`, value: f(data.totals.stockMt), unit: 'MT' },
        { label: 'Received', value: f(inMt), unit: 'MT' },
        { label: 'Issued', value: f(outMt), unit: 'MT' },
      ]} />

      <DrillChart
        series={series}
        categories={categories}
        axes={AXES}
        ariaLabel={`Finished stock by period: ${rows.map((x) => `${x.label} in ${f(x.inMt)}, out ${f(x.outMt)}, stock ${f(x.stockMt)} MT`).join('; ')}`}
      />

      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Finished stock by period">
          <thead><tr><th>Period</th><th className="r">Received (MT)</th><th className="r">Issued (MT)</th><th className="r">Stock at end (MT)</th></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.key}>
                <td><b>{x.label}</b>{x.fromDate !== x.toDate && <span className="pd-dim"> · {dm(x.fromDate)}–{dm(x.toDate)}</span>}</td>
                <td className="num r">{f(x.inMt)}</td>
                <td className="num r">{f(x.outMt)}</td>
                <td className="num r v-val"><b>{f(x.stockMt)}</b></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td>Total</td><td className="num r">{f(inMt)}</td><td className="num r">{f(outMt)}</td><td className="num r">{f(data.totals.stockMt)}</td></tr></tfoot>
        </table>
      </div>

      <SourceBox sources={SOURCES} formula={formula(data)} />
    </>
  );
}

const SOURCES: SourceSystem[] = [
  {
    name: 'ERP · stock ledger',
    rows: [
      ['Table', 'ITEMTRAN_BODY'],
      ['Filter', "ENTITY_CODE = 'MP', GODOWN_CODE = 'FGYRDP', STOCK_FLAG ≠ '4', strip-mill items (received by DIV_CODE = 'S1' in PROD_TRAN)"],
      ['Field', 'QTYRECD, QTYISSUED by TNATURE (PROD, SALE, M2M, SRET), per VRDATE'],
    ],
  },
  {
    name: 'ERP · opening stock',
    rows: [
      ['Table', 'ITEMOPBAL_MAST'],
      ['Filter', "GODOWN_CODE = 'FGYRDP', ACC_YEAR = year of the period end"],
      ['Field', 'YROPQTY'],
    ],
  },
];

const formula = (data: StockReport) => [
  'Stock = opening + received − issued, up to the end of the day',
  'Received = PROD + SRET + M2M in;  Issued = SALE + M2M out',
  data.basis.kind === 'ledger-start'
    ? `Opening = YROPQTY; not in ERP for ${data.basis.year}, so counted from 0 on ${dm(data.basis.from)} 2025`
    : `Opening = YROPQTY for ${data.basis.year}, on 1 April`,
];
