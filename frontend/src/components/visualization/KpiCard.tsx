/**
 * Headline KPI card — the pellet CppCard anatomy (title · value+unit · one-line note)
 * with a share meter in place of the sparkline, as on the approved comp.
 *
 * The tick and meter carry the SERIES colour (production / against order / free), which
 * is a category, not a verdict. None of these figures has an approved target on this
 * screen, so the card edge stays neutral — see DESIGN_HANDOVER.md §5, `metricTone()`.
 *
 * With `onOpen` the card is a button that opens its drill-down. `loading` shows a
 * skeleton in place of the value — only for the first load, never as "NA".
 */

/**
 * Category colours. prod / order / free are the output series; the rest mark where
 * material leaves the line in the material flow (ok is accepted, hold is pending QC,
 * reject and inline go to remelt, loss is the un-weighed remainder).
 */
export type Series = 'prod' | 'order' | 'free' | 'ok' | 'hold' | 'reject' | 'inline' | 'loss';

export default function KpiCard(props: {
  label: string;
  value: string;
  unit: string;
  note: string;
  series: Series;
  /** 0–100; omitted when the figure has no natural share to show. */
  meterPct?: number;
  loading?: boolean;
  /** Makes the card a button that opens its drill-down panel. */
  onOpen?: () => void;
  /** Accessible description of what opening does. */
  openLabel?: string;
  /** Two figures of one KPI from different sources, side by side, in place of `value`. */
  pair?: { source: string; value: string }[];
}) {
  const { meterPct } = props;
  const body = (
    <>
      <span className="rm-card-label">{props.label}</span>
      {props.pair && !props.loading ? (
        <span className="rm-card-value rm-card-pair num v-val">
          {props.pair.map((p) => (
            <span key={p.source} className="rm-card-pair-item">
              <span>{p.value}<span className="rm-card-unit">{props.unit}</span></span>
              <span className="rm-card-src">{p.source}</span>
            </span>
          ))}
        </span>
      ) : (
        <span className="rm-card-value num v-val">
          {props.loading
            ? <span className="skel skel--num-lg" role="status" aria-busy="true" aria-label="Loading" />
            : props.value}
          <span className="rm-card-unit">{props.unit}</span>
        </span>
      )}
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
    </>
  );

  if (props.onOpen) {
    return (
      <button
        type="button"
        className={`rm-card rm-card--button rm-tone--${props.series}`}
        aria-label={props.label}
        aria-haspopup="dialog"
        title={props.openLabel}
        onClick={props.onOpen}
      >
        {body}
      </button>
    );
  }
  return (
    <article className={`rm-card rm-tone--${props.series}`} aria-label={props.label}>
      {body}
    </article>
  );
}
