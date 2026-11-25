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
 *
 * RMS (the user, 25 Nov 2026) splits each section as HSM splits a strip size: Prime and Defective (the ERP's
 * "… DEFECTIVE" items, item class FGD), one bar per section with the defective part after the prime, and All /
 * Prime / Defective tabs. Repairable is not in the ERP's RMS stock as far as can be found — to add when the plant
 * says how it is booked.
 */
import { useMemo, useState } from 'react';
import Panel from '@/components/Panel';
import DrillDrawer, { Seg, Stats } from '@/components/drill/DrillDrawer';
import SourceBox from '@/components/drill/SourceBox';
import { fmtNum } from '@/components/drill/DrillChart';
import { fixed } from '@/lib/num';
import { dm, useSelection } from '@/services/hsmProduction';
import { useApi, type LsmStockReport, type RmdStockReport } from '@/services/hsmApi';
import { stockDate } from '@/components/production/stockAsOf';

type StockMill = 'rmd' | 'lsm' | 'rms';
type Report = RmdStockReport | LsmStockReport;
type Size = Report['sizes'][number];
type Tab = 'all' | 'prime' | 'defective';

/** A defective SKU: the ERP names it so ("MS CHANNEL 300 MM  DEFECTIVE"). */
const isDefective = (name: string) => /defective/i.test(name);
/** A section split into its grades; a grade below zero is not stock. */
const gradesOf = (s: Size) => {
  const sum = (d: boolean) => Math.max(0, s.items.filter((i) => isDefective(i.name) === d).reduce((a, i) => a + i.stockMt, 0));
  return { primeMt: sum(false), defectiveMt: sum(true) };
};

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
    ['Field', `the ${label} items (section read from ITEM_NAME; "… DEFECTIVE" items = defective); QTYRECD, QTYISSUED`],
  ],
};

export default function RmdStockBySize({ mill = 'rmd' }: { mill?: StockMill }) {
  const s = useRmdStock(mill);
  const graded = mill === 'rms';
  const [tab, setTab] = useState<Tab>('all');
  const [open, setOpen] = useState<Size | null>(null);
  /* Each section with its grades; on a tab, only its grade, highest stock first (the user, 30 Oct 2026). */
  const rows = useMemo(() => {
    const all = (s.data?.sizes ?? []).map((x) => ({ size: x, ...gradesOf(x) }));
    const shown = (r: (typeof all)[number]) => (!graded || tab === 'all' ? r.size.stockMt : tab === 'prime' ? r.primeMt : r.defectiveMt);
    return all.map((r) => ({ ...r, shownMt: shown(r) })).filter((r) => r.shownMt > 0.005).sort((a, b) => b.shownMt - a.shownMt);
  }, [s.data, graded, tab]);
  const data = s.data;
  const max = Math.max(...rows.map((r) => r.shownMt), 0.01);
  /* All: the ERP's total, as the Finished stock card; Prime / Defective: the sections listed, added up. */
  const totalMt = !graded || tab === 'all' ? data?.totalMt ?? 0 : rows.reduce((a, r) => a + r.shownMt, 0);
  const grades = useMemo(() => (s.data?.sizes ?? []).reduce((a, x) => { const g = gradesOf(x); return { prime: a.prime + g.primeMt, defective: a.defective + g.defectiveMt }; }, { prime: 0, defective: 0 }), [s.data]);
  const word = tab === 'defective' ? 'defective ' : tab === 'prime' ? 'prime ' : '';

  return (
    <Panel
      title="Finished stock by size"
      // As HSM's: the date the stock is counted to, and the total of the sizes in the title bar (the user, 31 Oct 2026).
      sub={data && data.erp.connection === 'up' ? `ERP · at end of ${dm(stockDate(data.asOf, data.erp.lastDate) ?? data.asOf)}` : undefined}
      right={data && data.erp.connection === 'up' && data.sizes.length > 0 ? (
        <>
          <span className="rm-sizes-total" aria-label="Total of the sizes listed">Total <b className="num">{fixed(totalMt, 1)} MT</b></span>
          {graded && (
            <Seg
              label="Stock grade"
              value={tab}
              onChange={setTab}
              options={[
                { id: 'all', label: 'All', title: `Every section in stock, prime and defective · ${fixed(data.totalMt, 1)} MT` },
                { id: 'prime', label: 'Prime', title: `Prime stock, by section · ${fixed(grades.prime, 1)} MT` },
                { id: 'defective', label: 'Defective', title: `Defective stock, by section · ${fixed(grades.defective, 1)} MT` },
              ]}
            />
          )}
        </>
      ) : undefined}
      className="rm-panel"
      bodyClass="rm-body"
    >
      {!data ? (
        s.error ? <p className="rm-empty">{s.error}</p> : <span className="skel skel--block" style={{ height: 150 }} role="status" aria-label="Loading" />
      ) : data.erp.connection === 'down' ? (
        <p className="rm-empty">{data.erp.message}</p>
      ) : rows.length === 0 ? (
        <p className="rm-empty">{graded && tab !== 'all' ? `No ${word}stock at the end of ${dm(data.asOf)}` : 'NA'}</p>
      ) : (
        <>
          {graded && tab === 'all' && (
            <div className="rm-sizes-legend" aria-hidden><i className="rm-tone--free" />Prime<i className="rm-tone--subprime" />Defective</div>
          )}
          <div className="rm-sizes-scroll">
            <ul className="rm-sizes" aria-label={`${word}stock in ${rows.length} groups`}>
              {rows.map((r) => (
                <li key={r.size.key}>
                  <button
                    type="button"
                    className={`rm-size rm-size--stock rmd-size-btn${graded && tab === 'defective' ? ' rm-size--subprime' : ''}`}
                    aria-haspopup="dialog"
                    aria-label={`${r.size.label}: ${fixed(r.shownMt, 1)} MT${graded && tab === 'all' && r.defectiveMt > 0 ? ` (prime ${fixed(r.primeMt, 1)}, defective ${fixed(r.defectiveMt, 1)})` : ''}, by SKU`}
                    title={graded && tab === 'all' && r.defectiveMt > 0 ? `Prime ${fixed(r.primeMt, 1)} MT · Defective ${fixed(r.defectiveMt, 1)} MT` : undefined}
                    onClick={() => setOpen(r.size)}
                  >
                    <span className="rm-size-name">{r.size.label}</span>
                    {/* Prime amber, then the defective part violet on the same bar — as HSM's prime / subprime. */}
                    <span className={`rm-size-stack${graded ? ' rm-size-stack--flush' : ''}`} aria-hidden>
                      {!graded
                        ? <i className="rm-tone--free" style={{ width: `${(r.shownMt / max) * 100}%` }} />
                        : <>
                          {tab !== 'defective' && r.primeMt > 0 && <i className="rm-tone--free" style={{ width: `${(r.primeMt / max) * 100}%` }} />}
                          {tab !== 'prime' && r.defectiveMt > 0 && <i className="rm-tone--subprime" style={{ width: `${(r.defectiveMt / max) * 100}%` }} />}
                        </>}
                    </span>
                    <span className="rm-size-total num">{fixed(r.shownMt, 1)} MT</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      <DrillDrawer
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? `${open.label} · finished stock by SKU` : ''}
        sub={`${mill.toUpperCase()} · MT`}
        loading={false}
        error={null}
        hasData={open !== null}
      >
        {open && data && <SizeBreakdown size={open} asOf={data.asOf} mill={mill} graded={graded} />}
      </DrillDrawer>
    </Panel>
  );
}

function SizeBreakdown({ size, asOf, mill, graded }: { size: Size; asOf: string; mill: StockMill; graded: boolean }) {
  const g = gradesOf(size);
  return (
    <>
      <Stats items={[
        { label: `${size.label} stock`, value: fmtNum(size.stockMt, 2), unit: `MT · end of ${dm(asOf)}` },
        ...(graded ? [
          { label: 'Prime', value: fmtNum(g.primeMt, 2), unit: 'MT' },
          { label: 'Defective', value: fmtNum(g.defectiveMt, 2), unit: 'MT' },
        ] : []),
        { label: 'SKUs', value: String(size.items.length), unit: '' },
      ]} />
      <div className="pd-table-wrap">
        <table className="grid pd-table" aria-label={`${size.label} stock by SKU`}>
          <thead><tr><th>SKU</th>{graded && <th>Grade</th>}<th>Item code</th><th className="r">Stock (MT)</th></tr></thead>
          <tbody>
            {size.items.map((i) => (
              <tr key={i.code}>
                <td><b>{i.name}</b></td>
                {graded && <td>{isDefective(i.name) ? 'Defective' : 'Prime'}</td>}
                <td className="num">{i.code}</td>
                <td className="num r v-val">{fmtNum(i.stockMt, 2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td><b>Total</b></td>{graded && <td />}<td /><td className="num r">{fmtNum(size.stockMt, 2)}</td></tr></tfoot>
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
          ...(graded ? ['Defective = the SKUs the ERP names "… DEFECTIVE" (item class FGD); prime = the rest'] : []),
        ]}
      />
    </>
  );
}
