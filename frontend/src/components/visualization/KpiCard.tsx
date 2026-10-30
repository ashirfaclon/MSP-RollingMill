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
import { dm } from '@/lib/plantDay';
import Sparkline, { type SparkData } from './Sparkline';

/** The note of a wired KPI whose source has nothing for the period. */
export const NO_ENTRIES = 'No entries recorded yet';

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
  /**
   * Wired, loaded, and its source has no entries for the period: the note says so, so an NA reads as
   * "nothing recorded", not a fault (the user, 28 Oct 2026). Never while loading or on an error.
   */
  noEntries?: boolean | string;
  /** The period's readings as a sparkline under the figure (Mill MPS). */
  spark?: SparkData;
  /**
   * The period has no entry, but an earlier day does (the user, 30 Oct 2026): that day's figure in
   * place of NA, and the note says whose it is — "Last entry · 27 Oct". A source that has never
   * had an entry passes none, and the card says "No entries recorded yet" as before.
   */
  lastEntry?: { value: string; date: string; pair?: { source: string; value: string }[]; where?: { name: string; time?: string | null } } | null;
  /**
   * The equipment the figure is from, and when it was entered (the user, 31 Oct 2026): two lines in
   * place of the note — the name, then "29 Oct 14:20". A last entry's equipment comes with it.
   */
  where?: { name: string; when: string } | null;
  /** The days or date the figure is for, beside the label: "1 Oct – 26 Oct 2026", "as of 26 Oct 2026" (the user, 31 Oct 2026). */
  term?: string | null;
}) {
  const { meterPct } = props;
  const last = props.lastEntry && !props.loading ? props.lastEntry : null;
  const value = last ? last.value : props.value;
  const pair = last?.pair ?? props.pair;
  const whereNote = (name: string, when: ReactNode, title: string) => (
    <span className="rm-card-where" title={title}><b>{name}</b><span>{when}</span></span>
  );
  const note = last
    ? last.where
      ? whereNote(last.where.name, <span className="rm-card-last">Last entry · {dm(last.date)}{last.where.time ? ` ${last.where.time}` : ''}</span>,
        `${last.where.name} · last entry ${dm(last.date)}${last.where.time ? ` ${last.where.time}` : ''} (none in the selected period)`)
      : <span className="rm-card-last" title="No entry in the selected period: the most recent entry is shown">Last entry · {dm(last.date)}</span>
    : props.where && !props.loading
      ? whereNote(props.where.name, props.where.when, `${props.where.name} · ${props.where.when}`)
    : props.noEntries && !props.loading
      ? <span className="rm-card-empty">{typeof props.noEntries === 'string' ? props.noEntries : NO_ENTRIES}</span>
      : props.note;
  const body = (
    <>
      <span className="rm-card-label">
        {/* No period beside a last entry: its note already dates the figure. */}
        <span className="rm-card-label-text">{props.label}{props.term && !last && <span className="rm-card-term">{props.term}</span>}</span>
        {/* Two sections share one unit: shown once by the title, so each figure gets the full half. */}
        {pair && props.unit && <span className="rm-card-label-unit">· {props.unit}</span>}
      </span>
      {pair && !props.loading ? (
        <span className="rm-card-value rm-card-pair num v-val">
          {pair.map((p) => (
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
            : value}
          <span className="rm-card-unit">{props.unit}</span>
        </span>
      )}
      {/* Always rendered (empty when there is nothing to flag) so the cards stay aligned. */}
      <span className="rm-card-note" title={typeof props.note === 'string' && props.note ? props.note : undefined}>{note}</span>
      {props.spark && !props.loading && <Sparkline {...props.spark} />}
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
