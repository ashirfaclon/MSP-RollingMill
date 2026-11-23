'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import Panel from '@/components/Panel';
import '@/components/plan/plan.css';
import { fixed } from '@/lib/num';

/** Headroom past the target, so a bar over target still has track to fill. */
const SCALE_OVER_TARGET = 1.25;
/** The daily strip's ceiling, % of target: a day far over plan is drawn to here. */
const STRIP_MAX_PCT = 140;

export interface ShiftBar {
  name: string;
  planMt: number | null;
  outputMt: number | null;
  /** Output ÷ target × 100 over the planned days; null when there is no target (or it is 0). */
  compliancePct: number | null;
}

/** One day of the strip: its compliance, or null where plan or output is missing. */
export interface PlanTrendDay { date: string; planMt: number | null; actualMt: number | null }

const tone = (pct: number | null) => (pct === null ? 'v-na' : pct >= 100 ? 'v-ok' : 'v-warn');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

/**
 * "Production vs plan", every mill — a compliance KPI for the whole plant day, no shift breakdown
 * (the user, 24 Nov 2026; the By shift view is kept in archive/shift-breakdown/). Built around the one
 * thing it says (the user, 24 Nov 2026):
 *   – compliance, the headline figure, beside one thick bar of output against the target;
 *   – each day's compliance as a strip under it (a one-day period: the seven days up to it), so the
 *     figure has its trend;
 *   – actual, target, plan gap and running rate in one row at the foot.
 * The plan is still typed as Day + Night per date and shown here as their total. Where the target
 * covers fewer days than the period's plan (the ERP is entered late), a line says so.
 */
export default function ShiftBars(props: {
  /** The whole day: output, the target it is compared with, and compliance. */
  day: Omit<ShiftBar, 'name'>;
  /** The plan for the whole period (the header chip). */
  planMt: number | null;
  planGapMt: number | null;
  /** The running-rate readout. */
  rate: ReactNode;
  /** A short line under the title: the plant day's window, or how much of the period the plan covers. */
  sub?: ReactNode;
  /** Opens the plan-vs-actual drill-down. */
  onOpen?: () => void;
  /** Opens the production plan config (the user, 28 Oct 2026). */
  onEditPlan?: () => void;
  /** More header buttons after Edit plan (HSM's Production variance checklist). */
  actions?: ReactNode;
  /** The plan report has not arrived yet: no "no plan" note meanwhile. */
  loading?: boolean;
  /** The days of the strip, oldest first; `selected` marks the period's own day among them. */
  trend?: { days: PlanTrendDay[]; selected?: string | null } | null;
}) {
  const { day, onOpen: open } = props;
  const scale = Math.max(day.planMt ?? 0, day.outputMt ?? 0) * SCALE_OVER_TARGET || 1;
  const at = (x: number | null) => `${Math.min(100, ((x ?? 0) / scale) * 100)}%`;
  const openOnKey = (e: KeyboardEvent) => { if (open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); } };
  // The target is over the days that have output; the chip is the whole period's plan.
  const partial = day.planMt !== null && props.planMt !== null && Math.abs(day.planMt - props.planMt) >= 0.5;
  const lateNote = partial ? notEnteredNote(props.trend ?? null) : null;
  // The strip only when some day has both plan and output: a row of empty stubs says nothing.
  const strip = props.trend && props.trend.days.length > 1 && props.trend.days.some((d) => d.planMt && d.actualMt !== null) ? props.trend : null;
  // A plan of 0 (a shutdown, or nothing filled in) has no line to draw.
  const target = day.planMt ? day.planMt : null;

  return (
    <Panel
      title="Production vs plan"
      sub={props.sub}
      right={
        <span className="rm-shift-head">
          {props.planMt === null
            ? <span className="chip chip--na" title="No plan for this period">Plan NA</span>
            : <span className="chip chip--info" title="The plan for the whole period">Plan {fixed(props.planMt, 0)} MT</span>}
          {props.onEditPlan && (
            <button type="button" className="rm-plan-edit" aria-haspopup="dialog" onClick={props.onEditPlan} title="Fill in the production plan">Edit plan</button>
          )}
          {props.actions}
        </span>
      }
      className="rm-panel"
      bodyClass="rm-body rm-pvp"
    >
      <div
        className={`rm-pvp-main${open ? ' rm-pvp-main--button' : ''}${strip ? '' : ' rm-pvp-main--solo'}`}
        {...(open ? {
          role: 'button', tabIndex: 0, 'aria-haspopup': 'dialog' as const, 'aria-label': 'Production against the plan, per day',
          title: 'Plan vs actual, per day', onClick: open, onKeyDown: openOnKey,
        } : {})}
      >
        <div className="rm-pvp-hero">
          <div className="rm-pvp-headline">
            <span className="rm-k">Compliance</span>
            <span className={`rm-pvp-pct rm-shift-comp num ${tone(day.compliancePct)}`}>
              {day.compliancePct === null ? 'NA' : `${fixed(day.compliancePct, 1)}%`}
            </span>
          </div>
          <div className="rm-pvp-gauge" style={{ ['--target' as string]: at(target) }}>
            <span className="rm-pvp-target-label" aria-hidden>{target !== null && <span>Target {fixed(target, 0)} MT</span>}</span>
            <span
              className="rm-pvp-track"
              role="img"
              aria-label={`${fixed(day.outputMt, 1)} MT against ${fixed(day.planMt, 0)} MT target, compliance ${day.compliancePct === null ? 'NA' : `${fixed(day.compliancePct, 1)}%`}`}
            >
              {/* With no target there is nothing to measure the output against: the track stays empty. */}
              {target !== null && <i className={`rm-pvp-fill ${tone(day.compliancePct)}`} style={{ width: at(day.outputMt) }} />}
              {target !== null && <i className="rm-pvp-target" />}
            </span>
            {lateNote && <span className="rm-pvp-note">{lateNote}</span>}
            {target === null && !props.loading && <span className="rm-pvp-note">No plan for this period — fill it in with Edit plan</span>}
          </div>
        </div>

        {strip && <Strip days={strip.days} selected={strip.selected ?? null} />}
      </div>

      <div className="rm-foot rm-pvp-stats">
        <span className="rm-foot-item">
          <span className="rm-k">Actual</span>
          <span className={`rm-foot-v rm-shift-val num ${day.outputMt === null ? 'v-na' : 'v-val'}`}>{day.outputMt === null ? 'NA' : `${fixed(day.outputMt, 1)} MT`}</span>
        </span>
        <span className="rm-foot-item">
          <span className="rm-k">Target</span>
          <span className={`rm-foot-v num ${target === null ? 'v-na' : 'v-val'}`}>{target === null ? 'NA' : `${fixed(target, 1)} MT`}</span>
        </span>
        {open ? (
          <button type="button" className="rm-foot-item rm-foot-btn" onClick={open} aria-haspopup="dialog" title="Plan vs actual, per day">
            <PlanGap v={props.planGapMt} />
          </button>
        ) : (
          <span className="rm-foot-item"><PlanGap v={props.planGapMt} /></span>
        )}
        {props.rate}
      </div>
    </Panel>
  );
}

/**
 * Why the target is smaller than the period's plan, in plain words (the user, 24 Nov 2026): the planned
 * days whose production is not in yet — "23 Nov not entered in ERP yet — compared up to 22 Nov".
 */
function notEnteredNote(trend: { days: PlanTrendDay[]; selected?: string | null } | null): string | null {
  if (!trend) return null;
  // A one-day period's strip holds the week before it; only the day itself counts.
  const days = trend.selected ? trend.days.filter((d) => d.date === trend.selected) : trend.days;
  const missing = days.filter((d) => d.planMt && d.actualMt === null).map((d) => d.date);
  if (!missing.length) return null;
  const entered = days.filter((d) => d.actualMt !== null).map((d) => d.date);
  const lastEntered = entered.at(-1) ?? null;
  const which = missing.length === 1 ? dayLabel(missing[0]) : `${dayLabel(missing[0])} – ${dayLabel(missing[missing.length - 1])}`;
  // The usual case: the latest days are not in yet.
  if (lastEntered && missing.every((d) => d > lastEntered)) return `${which} not entered in ERP yet — compared up to ${dayLabel(lastEntered)}`;
  return `${missing.length} day${missing.length > 1 ? 's' : ''} not entered in ERP yet — compared over the days entered`;
}

/** Each day's compliance as a column against the 100 % line; a day with no plan or no output is a stub. */
function Strip({ days, selected }: { days: PlanTrendDay[]; selected: string | null }) {
  const pctOf = (d: PlanTrendDay) => (d.planMt && d.actualMt !== null ? (d.actualMt / d.planMt) * 100 : null);
  return (
    <div className="rm-pvp-strip">
      <span className="rm-k">{selected ? 'Daily compliance · the 7 days up to this one' : 'Daily compliance'}</span>
      <div
        className="rm-pvp-cols"
        role="img"
        style={{ ['--line' as string]: `${(100 / STRIP_MAX_PCT) * 100}%` }}
        aria-label={`Daily compliance: ${days.map((d) => { const p = pctOf(d); return `${dayLabel(d.date)} ${p === null ? 'NA' : `${fixed(p, 0)}%`}`; }).join(', ')}`}
      >
        <i className="rm-pvp-line" aria-hidden />
        {days.map((d) => {
          const p = pctOf(d);
          return (
            <i
              key={d.date}
              className={`rm-pvp-col ${tone(p)}${d.date === selected ? ' is-selected' : ''}`}
              style={{ height: p === null ? '3px' : `${Math.max(3, (Math.min(p, STRIP_MAX_PCT) / STRIP_MAX_PCT) * 100)}%` }}
              title={`${dayLabel(d.date)} · ${p === null ? 'NA' : `${fixed(p, 1)}%`}${d.actualMt !== null && d.planMt !== null ? ` · ${fixed(d.actualMt, 1)} of ${fixed(d.planMt, 1)} MT` : ''}`}
            />
          );
        })}
      </div>
      <div className="rm-pvp-axis" aria-hidden>
        <span>{dayLabel(days[0].date)}</span>
        <span className="rm-pvp-axis-mid">dashed line = 100 % of target</span>
        <span>{dayLabel(days[days.length - 1].date)}</span>
      </div>
    </div>
  );
}

/**
 * Plan gap = production − plan. Ahead of plan: "+" and green; short of it: the number alone,
 * no sign, amber (the user, 17 Oct 2026).
 */
function PlanGap({ v }: { v: number | null }) {
  return (
    <>
      <span className="rm-k">Plan gap</span>
      <span className={`rm-foot-v num ${v === null ? 'v-na' : v < 0 ? 'v-warn' : 'v-ok'}`}>
        {v === null ? 'NA' : `${v > 0 ? '+' : ''}${fixed(Math.abs(v), 1)} MT`}
      </span>
    </>
  );
}
