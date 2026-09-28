import type { Series } from './KpiCard';

/** Series key: dot, label, optional value. */
export default function LegendItem({ series, label, value }: { series: Series; label: string; value?: string }) {
  return (
    <span className={`rm-legend-item rm-tone--${series}`}>
      <i className="rm-dot" aria-hidden />
      <span className="rm-legend-label">{label}</span>
      {value && <b className="num">{value}</b>}
    </span>
  );
}
