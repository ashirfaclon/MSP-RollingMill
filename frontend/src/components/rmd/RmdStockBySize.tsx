'use client';

/**
 * RMD finished stock by size, by the plant's stock query (ERP ITEMTRAN_BODY, godown FGYRDP) counted to the end of
 * the Duration period. Overview: one row per bar size, every SKU of that size summed. Items with
 * no bar size and miss-roll bars are left out (the plant, 16 Oct 2026). All of it is free stock,
 * so there is no with-order / free split. Clicking a row opens its breakdown by SKU; a SKU or row
 * at 0 isn't shown.
 *
 * LSM uses the same panel (mill="lsm"): one row per LSM section, in the plant's names (A 65×65×8,
 * MC 75×40, MB 125×70 …), its lengths and defective item inside — the ERP's Stock Sheet Engine.
 */
import { useMemo, useState } from 'react';
import Panel from '@/components/Panel';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import SourceBox from '@/components/drill/SourceBox';
import { fmtNum } from '@/components/drill/DrillChart';
import { fixed } from '@/lib/num';
import { dm, useSelection } from '@/services/hsmProduction';
import { useApi, type LsmStockReport, type RmdStockReport } from '@/services/hsmApi';
import { stockDate } from '@/components/production/stockAsOf';

type StockMill = 'rmd' | 'lsm' | 'rms';
type Report = RmdStockReport | LsmStockReport;
type Size = Report['sizes'][number];

/** Finished stock at the end of the Duration period — shared by this panel and Order allocation (useApi dedupes the URL). */
export function useRmdStock(mill: StockMill = 'rmd') {
  const { dates } = useSelection();
  const url = dates ? `/api/${mill}/stock?to=${dates.to}` : null;
  const s = useApi<Report>(url);
  return { data: s.data && s.dataUrl === url ? s.data : null, error: s.error };
}

const SOURCE: Record<StockMill, (label: string) => [string, string][]> = {
  rmd: (label) => [
    ['Table', 'ITEMTRAN_BODY (the plant\'s stock query)'],
    ['Filter', "ENTITY_CODE = 'MP', GODOWN_CODE = 'FGYRDP', DIV_CODE in RM, RS, LS, PL, SI, SM, S1; TCODE not in (MC, FS, ME, NG, NP, QJ, ZH, ZP, ZW, ZF, MR, ZM, ES, NT, ZS, ZA, MD, NI, Z8)"],
    ['Field', `ITEM_CODE = the ${label} SKUs of the plant's item list; QTYRECD, QTYISSUED`],
  ],
  lsm: (label) => [
    ['Table', 'ITEMTRAN_BODY + ITEM_MAST (the ERP\'s Stock Sheet Engine, division LS)'],
    ['Filter', "ENTITY_CODE = 'MP', DIV_CODE = 'LS', ITEM_NATURE in FG, SM (not closed, billets left out), GODOWN_CODE ≠ 'STOR1P'; TCODE not in (MC, FS, ME, NG, NP, QJ, ZH, ZP, ZW, ZF, MR, ZM, ES, NT, ZS, ZA, MD, NI, Z8)"],
    ['Field', `the ${label} items (section read from ITEM_NAME; LSM's 19 sections); QTYRECD, QTYISSUED`],
  ],
  rms: (label) => [
    ['Table', 'ITEMTRAN_BODY + ITEM_MAST (the ERP\'s Stock Sheet Engine, division RS)'],
    ['Filter', "ENTITY_CODE = 'MP', DIV_CODE = 'RS', ITEM_NATURE in FG, SM (not closed, billets left out), GODOWN_CODE ≠ 'STOR1P'; TCODE not in (MC, FS, ME, NG, NP, QJ, ZH, ZP, ZW, ZF, MR, ZM, ES, NT, ZS, ZA, MD, NI, Z8)"],
    ['Field', `the ${label} items (section read from ITEM_NAME); QTYRECD, QTYISSUED`],
  ],
};

export default function RmdStockBySize({ mill = 'rmd' }: { mill?: StockMill }) {
  const s = useRmdStock(mill);
  /* Highest stock first (the user, 30 Oct 2026), whatever order the ERP lists the sizes in. */
  const data = useMemo(() => (s.data ? { ...s.data, sizes: [...s.data.sizes].sort((x, y) => y.stockMt - x.stockMt) } : null), [s.data]);
  const [open, setOpen] = useState<Size | null>(null);
  const max = Math.max(...(data?.sizes.map((x) => x.stockMt) ?? []), 0.01);

  return (
    <Panel
      title="Finished stock by size"
      // As HSM's: the date the stock is counted to, and the total of the sizes in the title bar (the user, 31 Oct 2026).
      sub={data && data.erp.connection === 'up' ? `ERP · at end of ${dm(stockDate(data.asOf, data.erp.lastDate) ?? data.asOf)}` : undefined}
      right={data && data.erp.connection === 'up' && data.sizes.length > 0
        ? <span className="rm-sizes-total" aria-label="Total of the sizes listed">Total <b className="num">{fixed(data.totalMt, 1)} MT</b></span>
        : undefined}
      className="rm-panel"
      bodyClass="rm-body"
    >
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
        {open && data && <SizeBreakdown size={open} asOf={data.asOf} mill={mill} />}
      </DrillDrawer>
    </Panel>
  );
}

function SizeBreakdown({ size, asOf, mill }: { size: Size; asOf: string; mill: StockMill }) {
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
          rows: [...SOURCE[mill](size.label), ['Date', `VRDATE up to ${dm(asOf)}`]],
        }]}
        formula={[
          'Stock = Σ QTYRECD − Σ QTYISSUED of every ledger entry up to the date',
          `${size.label} = Σ stock of its SKUs`,
        ]}
      />
    </>
  );
}
