/**
 * Headline KPI card — the pellet CppCard anatomy (title · value+unit · one-line note)
 * with a share meter in place of the sparkline, as on the approved comp.
 *
 * The tick and meter carry the SERIES colour (production / against order / free), which
 * is a category, not a verdict. None of these figures has an approved target on this
 * screen, so the card edge stays neutral — see DESIGN_HANDOVER.md §5, `metricTone()`.
 */
export type Series = 'prod' | 'order' | 'free';

export default function KpiCard(props: {
  label: string;
  value: string;
  unit: string;
  note: string;
  series: Series;
  /** 0–100; omitted when the figure has no natural share to show. */
  meterPct?: number;
}) {
  const { meterPct } = props;
  return (
    <article className={`rm-card rm-tone--${props.series}`} aria-label={props.label}>
      <span className="rm-card-label">{props.label}</span>
      <span className="rm-card-value num v-val">
        {props.value}
        <span className="rm-card-unit">{props.unit}</span>
      </span>
      <span className="rm-card-note" title={props.note}>{props.note}</span>
      {meterPct !== undefined && (
        <span
          className="rm-meter"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(meterPct)}
          aria-label={`${props.label} share`}
        >
          <i style={{ width: `${Math.max(0, Math.min(100, meterPct))}%` }} />
        </span>
      )}
    </article>
  );
}
