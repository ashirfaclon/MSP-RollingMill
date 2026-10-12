'use client';

/**
 * RMD finished stock by size, from the ERP item ledger (godown FGYRDP) counted to the end of
 * the Duration period. Overview: one row per bar size, every SKU of that size summed, then
 * 'Other' (the plant's items with no bar size). All of it is free stock, so there is no
 * with-order / free split. Clicking a row opens its breakdown by SKU: every SKU of the plant's
 * list (Rolling_Mill_TMT_Items.xlsx) in stock is in one row; a SKU or row at 0 isn't shown.
 */
import { useState } from 'react';
import Panel from '@/components/Panel';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import SourceBox from '@/components/drill/SourceBox';
import { fmtNum } from '@/components/drill/DrillChart';
import { fixed } from '@/lib/num';
import { dm, useSelection } from '@/services/hsmProduction';
import { useApi, type RmdStockReport } from '@/services/hsmApi';

type Size = RmdStockReport['sizes'][number];

/** Finished stock at the end of the Duration period — shared by this panel and Order allocation (useApi dedupes the URL). */
export function useRmdStock() {
  const { dates } = useSelection();
  const url = dates ? `/api/rmd/stock?to=${dates.to}` : null;
  const s = useApi<RmdStockReport>(url);
  return { data: s.data && s.dataUrl === url ? s.data : null, error: s.error };
}

export default function RmdStockBySize() {
  const s = useRmdStock();
  const data = s.data;
  const [open, setOpen] = useState<Size | null>(null);
  const max = Math.max(...(data?.sizes.map((x) => x.stockMt) ?? []), 0.01);

  return (
    <Panel title="Finished stock by size" className="rm-panel" bodyClass="rm-body">
      {!data ? (
        s.error ? <p className="rm-empty">{s.error}</p> : <span className="skel skel--block" style={{ height: 150 }} role="status" aria-label="Loading" />
      ) : data.erp.connection === 'down' ? (
        <p className="rm-empty">{data.erp.message}</p>
      ) : data.sizes.length === 0 ? (
        <p className="rm-empty">NA</p>
      ) : (
        <div className="rm-sizes-scroll">
          <ul className="rm-sizes" aria-label={`Stock in ${data.sizes.length} groups`}>
            {data.sizes.map((x) => (
              <li key={x.key}>
                <button
                  type="button"
                  className="rm-size rm-size--stock rmd-size-btn"
                  aria-haspopup="dialog"
                  aria-label={`${x.label}: ${fixed(x.stockMt, 1)} MT, by SKU`}
                  onClick={() => setOpen(x)}
                >
                  <span className="rm-size-name">{x.label}</span>
                  <span className="rm-size-stack" aria-hidden>
                    <i className="rm-tone--free" style={{ width: `${(x.stockMt / max) * 100}%` }} />
                  </span>
                  <span className="rm-size-total num">{fixed(x.stockMt, 1)} MT</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <DrillDrawer
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? `${open.label} · finished stock by SKU` : ''}
        sub="RMD · MT"
        loading={false}
        error={null}
        hasData={open !== null}
      >
        {open && data && <SizeBreakdown size={open} asOf={data.asOf} />}
      </DrillDrawer>
    </Panel>
  );
}

function SizeBreakdown({ size, asOf }: { size: Size; asOf: string }) {
  return (
    <>
      <Stats items={[
        { label: `${size.label} stock`, value: fmtNum(size.stockMt, 2), unit: `MT · end of ${dm(asOf)}` },
        { label: 'SKUs', value: String(size.items.length), unit: '' },
      ]} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label={`${size.label} stock by SKU`}>
          <thead><tr><th>SKU</th><th>Item code</th><th className="r">Stock (MT)</th></tr></thead>
          <tbody>
            {size.items.map((i) => (
              <tr key={i.code}><td><b>{i.name}</b></td><td className="num">{i.code}</td><td className="num r v-val">{fmtNum(i.stockMt, 2)}</td></tr>
            ))}
          </tbody>
          <tfoot><tr><td><b>Total</b></td><td /><td className="num r">{fmtNum(size.stockMt, 2)}</td></tr></tfoot>
        </table>
      </div>
      <SourceBox
        sources={[{
          name: 'ERP',
          rows: [
            ['Table', 'VG_ITEM_LEDGER'],
            ['Filter', "ENTITY_CODE = 'MP', GODOWN_CODE = 'FGYRDP'"],
            ['Field', `ITEM_CODE = the ${size.label} SKUs of the plant's item list; QTYRECD, QTYISSUED`],
            ['Date', `VRDATE up to ${dm(asOf)}`],
          ],
        }]}
        formula={[
          'Stock = Σ QTYRECD − Σ QTYISSUED of every ledger entry up to the date',
          `${size.label} = Σ stock of its SKUs`,
        ]}
      />
    </>
  );
}
