'use client';

/**
 * Finished stock as a headline card, at the right end of the KPI strip (the user, 31 Oct 2026 —
 * it replaces the Order allocation panel): the ERP stock at the end of the Duration period, with
 * the date it is counted to beside the label ("as of 26 Oct 2026").
 *   HSM            the ERP stock ledger; opens the stock drawer (received, issued, held per day).
 *   RMD, LSM, RMS  the total of Finished stock by size; opens the stock by size, largest first.
 */
import { useMemo, useState } from 'react';
import KpiCard from '@/components/visualization/KpiCard';
import StockDrawer from '@/components/drill/StockDrawer';
import DrillDrawer, { Stats } from '@/components/drill/DrillDrawer';
import SourceBox from '@/components/drill/SourceBox';
import { fmtNum } from '@/components/drill/DrillChart';
import { useRmdStock } from '@/components/rmd/RmdStockBySize';
import { fixed } from '@/lib/num';
import { dm } from '@/services/hsmProduction';
import { useFinishedStock } from './useFinishedStock';
import { stockAsOfText, stockDate } from './stockAsOf';

type Mill = 'hsm' | 'rmd' | 'lsm' | 'rms';

export default function FinishedStockCard({ mill }: { mill: Mill }) {
  return mill === 'hsm' ? <HsmStockCard /> : <SizeStockCard mill={mill} />;
}

function HsmStockCard() {
  const { data, loading, error } = useFinishedStock();
  const [open, setOpen] = useState(false);
  const mt = data ? data.totals.stockMt : null;
  return (
    <>
      <KpiCard
        label="Finished stock"
        term={data ? stockAsOfText(data.asOf, data.erp.lastDate) : null}
        value={mt === null ? 'NA' : fixed(mt, 1)}
        unit="MT"
        note={error ? 'ERP data unavailable' : ''}
        series="free"
        loading={loading}
        onOpen={() => setOpen(true)}
        openLabel="Stock received, issued and held, per day"
      />
      <StockDrawer open={open} onClose={() => setOpen(false)} data={data} loading={loading} error={error} />
    </>
  );
}

const SOURCE: Record<Exclude<Mill, 'hsm'>, string> = {
  rmd: 'ITEMTRAN_BODY, godown FGYRDP (the plant\'s stock query)',
  lsm: 'ITEMTRAN_BODY + ITEM_MAST, division LS (the ERP\'s Stock Sheet Engine)',
  rms: 'ITEMTRAN_BODY + ITEM_MAST, division RS (the ERP\'s Stock Sheet Engine)',
};

function SizeStockCard({ mill }: { mill: Exclude<Mill, 'hsm'> }) {
  const { data, error } = useRmdStock(mill);
  const [open, setOpen] = useState(false);
  const up = !!data && data.erp.connection === 'up';
  const mt = up ? data!.totalMt : null;
  const sizes = useMemo(() => (data ? [...data.sizes].sort((a, b) => b.stockMt - a.stockMt) : []), [data]);
  const date = data ? stockDate(data.asOf, data.erp.lastDate) : null;
  return (
    <>
      <KpiCard
        label="Finished stock"
        term={up ? stockAsOfText(data!.asOf, data!.erp.lastDate) : null}
        value={mt === null ? 'NA' : fixed(mt, 1)}
        unit="MT"
        note={error ? 'ERP data unavailable' : data && !up ? data.erp.message : ''}
        series="free"
        loading={!data && !error}
        onOpen={() => setOpen(true)}
        openLabel="Finished stock by size"
      />
      <DrillDrawer open={open} onClose={() => setOpen(false)} title="Finished stock" sub={`${mill.toUpperCase()} · MT by size`}
        loading={!data && !error} error={error} hasData={up}>
        {up && (
          <>
            <Stats items={[
              { label: 'Finished stock', value: fmtNum(data!.totalMt, 1), unit: date ? `MT · as of ${dm(date)}` : 'MT' },
              { label: 'Sizes', value: String(sizes.length), unit: '' },
            ]} />
            <div className="pd-table-wrap">
              <table className="grid pd-table" aria-label="Finished stock by size">
                <thead><tr><th>Size</th><th className="r">SKUs</th><th className="r">Stock (MT)</th><th className="r">Share</th></tr></thead>
                <tbody>
                  {sizes.map((x) => (
                    <tr key={x.key}>
                      <td><b>{x.label}</b></td>
                      <td className="num r">{x.items.length}</td>
                      <td className="num r v-val">{fmtNum(x.stockMt, 1)}</td>
                      <td className="num r">{data!.totalMt > 0 ? `${fixed((x.stockMt / data!.totalMt) * 100, 1)} %` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td><b>Total</b></td><td /><td className="num r">{fmtNum(data!.totalMt, 1)}</td><td /></tr></tfoot>
              </table>
            </div>
            <SourceBox
              sources={[{ name: 'ERP', rows: [['Table', SOURCE[mill]], ['Date', `VRDATE up to ${dm(data!.asOf)}`]] }]}
              formula={['Stock = Σ QTYRECD − Σ QTYISSUED of every ledger entry up to the date', 'Finished stock = Σ stock of every size']}
            />
          </>
        )}
      </DrillDrawer>
    </>
  );
}
