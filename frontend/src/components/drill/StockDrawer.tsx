'use client';

/**
 * Finished-strip stock in the FG yard, from the ERP stock ledger: opening (when the ERP has
 * one for the year) + everything received − everything issued, up to the period's end.
 * While the year's opening is missing the count starts at 0 on go-live (30 Nov 2025), so
 * the figure is the change since then — it becomes the true stock by itself once the
 * opening is entered.
 */
import { useMemo } from 'react';
import DrillDrawer, { Stats } from './DrillDrawer';
import DrillChart, { fmtNum, type DrillAxis, type DrillSeries } from './DrillChart';
import { hhmm } from './CounterDrawer';
import { dm } from '@/services/hsmProduction';
import type { StockReport } from '@/services/hsmApi';

const AXES: DrillAxis[] = [
  { title: 'Stock (MT)', unit: 'MT' },
  { title: 'Moved per day (MT)', unit: 'MT', opposite: true, min: 0 },
];

export default function StockDrawer(props: {
  open: boolean; onClose: () => void; data: StockReport | null; loading: boolean; error: string | null;
}) {
  return (
    <DrillDrawer
      open={props.open}
      onClose={props.onClose}
      title="Finished stock · ERP"
      sub="HSM · strip in the finished-goods yard (FGYRDP), MT"
      loading={props.loading}
      error={props.error}
      hasData={!!props.data}
    >
      {props.data && <Content data={props.data} />}
    </DrillDrawer>
  );
}

function Content({ data }: { data: StockReport }) {
  const t = data.totals;
  const fromLedger = data.basis.kind === 'ledger-start';
  const days = data.daily;
  const categories = useMemo(() => days.map((d) => dm(d.date)), [days]);
  const series = useMemo<DrillSeries[]>(() => [
    { id: 'in', name: 'Received (production, returns, transfers in)', token: '--s-prod', type: 'column', axis: 1, data: days.map((d) => d.inMt || null), dp: 2 },
    { id: 'out', name: 'Issued (sales, transfers out)', token: '--s-order', type: 'column', axis: 1, data: days.map((d) => d.outMt || null), dp: 2 },
    { id: 'stock', name: fromLedger ? 'Stock (change since 30 Nov)' : 'Stock', token: '--s-free', type: 'line', data: days.map((d) => d.stockMt), dp: 2 },
  ], [days, fromLedger]);

  return (
    <>
      {fromLedger && (
        <p className="pd-notice" role="note">
          The ERP has no opening stock for {data.basis.year} (1 April). Counting starts at 0 on {dm(data.basis.from)} &apos;25,
          the ERP go-live — so this is the change in stock since then, not the full stock. It switches to the true
          stock automatically once the opening is entered in the ERP.
        </p>
      )}
      <Stats items={[
        { label: `Stock at end of ${dm(data.asOf)}`, value: fmtNum(t.stockMt, 2), unit: 'MT' },
        { label: fromLedger ? 'Opening (not in ERP)' : `Opening 1 Apr (${data.basis.year})`, value: fmtNum(t.openingMt, 2), unit: 'MT', tone: fromLedger ? 'v-na' : 'v-val' },
        { label: `Received since ${dm(data.basis.from)}`, value: fmtNum(t.inMt, 2), unit: 'MT' },
        { label: `Issued since ${dm(data.basis.from)}`, value: fmtNum(t.outMt, 2), unit: 'MT' },
      ]} />

      <DrillChart
        series={series}
        categories={categories}
        axes={AXES}
        ariaLabel={`Finished stock by day from ${dm(data.basis.from)} to ${dm(data.asOf)}; ends at ${fmtNum(t.stockMt, 1)} MT`}
      />

      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label="Stock movements by type">
          <thead><tr><th>Movement (ERP TNATURE)</th><th className="r">Received (MT)</th><th className="r">Issued (MT)</th></tr></thead>
          <tbody>
            {data.byType.map((m) => (
              <tr key={m.type}><td>{m.label} <span className="pd-dim">· {m.type}</span></td><td className="num r v-val">{fmtNum(m.inMt, 2)}</td><td className="num r v-val">{fmtNum(m.outMt, 2)}</td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td><b>Opening + received − issued</b></td><td className="num r" colSpan={2}><b>{fmtNum(t.openingMt, 2)} + {fmtNum(t.inMt, 2)} − {fmtNum(t.outMt, 2)} = {fmtNum(t.stockMt, 2)} MT</b></td></tr>
          </tfoot>
        </table>
      </div>

      <h3 className="pd-h">By size · {data.sizes.length} items{data.negative.sizes ? ` · ${data.negative.sizes} below zero` : ''}</h3>
      <div className="pd-table-wrap pd-table-wrap--tall">
        <table className="grid pd-table" aria-label="Finished stock by size">
          <thead><tr><th>Size (mm)</th><th>ERP item</th><th className="r">Opening</th><th className="r">Received</th><th className="r">Issued</th><th className="r">Stock (MT)</th></tr></thead>
          <tbody>
            {data.sizes.map((s) => (
              <tr key={s.item}>
                <td><b>{s.label}</b>{s.defective && <span className="pd-dim"> · defective</span>}</td>
                <td className="pd-dim">{s.item}</td>
                <td className="num r">{fmtNum(s.openingMt, 2)}</td>
                <td className="num r">{fmtNum(s.inMt, 2)}</td>
                <td className="num r">{fmtNum(s.outMt, 2)}</td>
                <td className={`num r ${s.stockMt < -0.005 ? 'v-warn' : 'v-val'}`}><b>{fmtNum(s.stockMt, 2)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="pd-notes">
        <li><b>Source</b> — ERP stock ledger (ITEMTRAN_BODY) for strip-mill items in the finished-goods yard FGYRDP: production received (PROD), sales (SALE), item-to-item transfers (M2M) and sales returns (SRET), synced {hhmm(data.erp.syncedAt)}; latest movement {dm(data.erp.lastDate)}. Loading advices (LADV) only reserve stock and are left out. The yard is shared with LSM; only strip-mill items are counted.</li>
        <li><b>Opening</b> — ERP ITEMOPBAL_MAST, YROPQTY for the financial year of the date shown. {fromLedger ? `Not entered for ${data.basis.year} (nor 25-26), so the count starts at 0 on ${dm(data.basis.from)} '25.` : `Entered for ${data.basis.year}: stock = opening on 1 April + movements since.`}</li>
        {data.negative.sizes > 0 && (
          <li className="v-warn"><b>{data.negative.sizes} sizes are below zero</b> ({fmtNum(data.negative.mt, 2)} MT in total): more of them was issued than received since {dm(data.basis.from)}. That strip was already in the yard before then — it will balance once the opening stock is entered.</li>
        )}
      </ul>
    </>
  );
}
