/**
 * Finished stock split, under Order allocation's Finished stock on every mill: Stock with order
 * and Free stock, NA like Made To Order / Made To Stock until the plant gives the split (the user,
 * 17 Oct 2026).
 */
export default function StockSplitLegend() {
  return (
    <div className="rm-legend">
      <span className="rmd-legend-item rm-tone--order"><i className="rm-dot" aria-hidden />Stock with order <b className="num v-na">NA</b></span>
      <span className="rmd-legend-item rm-tone--free"><i className="rm-dot" aria-hidden />Free stock <b className="num v-na">NA</b></span>
    </div>
  );
}
