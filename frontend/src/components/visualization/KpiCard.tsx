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
export type Series =
  | 'prod' | 'order' | 'free' | 'ok' | 'hold' | 'reject' | 'inline' | 'loss'
  /* the mass balance: the input/output difference and the three other booked losses */
  | 'diff' | 'bloss' | 'endcut' | 'missroll';

import type { ReactNode } from 'react';

export default function KpiCard(props: {
  label: string;
  value: string;
  unit: string;
  /** One line under the value; a node when part of it is a figure (e.g. a highlighted delta). */
  note: ReactNode;
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
  /** Colours the value against limits: v-ok inside, v-risk outside. */
  tone?: 'v-ok' | 'v-warn' | 'v-risk';
}) {
  const { meterPct } = props;
  const body = (
    <>
      <span className="rm-card-label">
        {props.label}
        {/* Two sections share one unit: shown once by the title, so each figure gets the full half. */}
        {props.pair && <span className="rm-card-label-unit">· {props.unit}</span>}
      </span>
      {props.pair && !props.loading ? (
        <span className="rm-card-value rm-card-pair num v-val">
          {props.pair.map((p) => (
            <span key={p.source} className="rm-card-pair-item">
              {/* Each half is its own section: title on top, then the figure. */}
              <span className="rm-card-src">{p.source}</span>
              <span className="rm-card-pair-v">{p.value}</span>
            </span>
          ))}
        </span>
      ) : (
        <span className={`rm-card-value num ${props.tone ?? 'v-val'}`}>
          {props.loading
            ? <span className="skel skel--num-lg" role="status" aria-busy="true" aria-label="Loading" />
            : props.value}
          <span className="rm-card-unit">{props.unit}</span>
        </span>
      )}
      {/* Always rendered (empty when there is nothing to flag) so the cards stay aligned. */}
      <span className="rm-card-note" title={typeof props.note === 'string' && props.note ? props.note : undefined}>{props.note}</span>
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
