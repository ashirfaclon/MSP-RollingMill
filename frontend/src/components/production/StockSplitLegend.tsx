import LegendItem from '@/components/visualization/Legend';
import { fixed } from '@/lib/num';

/**
 * Finished stock split, under Order allocation's Finished stock on every mill: Stock with order
 * and Free stock (the user, 17 Oct 2026). NA, like Made To Order / Made To Stock, where the mill
 * has no figure for it; HSM passes its figures so the line agrees with its Stock with order and
 * Free stock cards (all stock free — the ERP links no yard stock to an order), drawn like its
 * Made To Order / Made To Stock line.
 */
export default function StockSplitLegend({ withOrderMt = null, freeMt = null }: { withOrderMt?: number | null; freeMt?: number | null }) {
  if (withOrderMt !== null && freeMt !== null) {
    return (
      <div className="rm-legend">
        <LegendItem series="order" label="Stock with order" value={`${fixed(withOrderMt, 1)} MT`} />
        <LegendItem series="free" label="Free stock" value={`${fixed(freeMt, 1)} MT`} />
      </div>
    );
  }
  return (
    <div className="rm-legend">
      <span className="rmd-legend-item rm-tone--order"><i className="rm-dot" aria-hidden />Stock with order <b className="num v-na">NA</b></span>
      <span className="rmd-legend-item rm-tone--free"><i className="rm-dot" aria-hidden />Free stock <b className="num v-na">NA</b></span>
    </div>
  );
}
