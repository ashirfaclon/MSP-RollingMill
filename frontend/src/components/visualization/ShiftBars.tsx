'use client';

import { useState, type KeyboardEvent, type ReactNode } from 'react';
import Panel from '@/components/Panel';
import { Seg } from '@/components/drill/DrillDrawer';
import { fixed } from '@/lib/num';

/** Headroom past the largest target, so a bar over target still has track to fill. */
const SCALE_OVER_TARGET = 1.25;

export interface ShiftBar {
  name: string;
  planMt: number | null;
  outputMt: number | null;
  /** Output ÷ target × 100 over the planned days; null when there is no target (or it is 0). */
  compliancePct: number | null;
}

export type View = 'shift' | 'day';

/**
 * "Production by shift": each shift's output against its plan target, with its compliance
 * (actual ÷ plan). A toggle in the head flips the card over (a 180° turn) to the whole day:
 * one bar for all shifts together against the day's plan. Shared by every mill — HSM passes
 * live figures, RMD a sample — so the panel reads the same whatever the number of shifts.
 */
export default function ShiftBars(props: {
  shifts: ShiftBar[];
  /** The whole day: every shift together. */
  day: Omit<ShiftBar, 'name'>;
  planMt: number | null;
  planGapMt: number | null;
  /** The running-rate readout (live on HSM). */
  rate: ReactNode;
  /** A short line under the title, e.g. how much of the period the plan covers. */
  sub?: ReactNode;
  /** Opens the plan-vs-actual drill-down from the bars and the plan gap (HSM), in the view shown. */
  onOpen?: (view: View) => void;
}) {
  const [view, setView] = useState<View>('shift');
  const open = props.onOpen ? () => props.onOpen!(view) : undefined;
  const flipped = view === 'day';

  const face = (v: View) => {
    const hidden = v !== view;
    return (
      // The face turned away is inert: not focusable, not read, not clickable.
      <div className={`rm-flip-face rm-flip-face--${v === 'shift' ? 'front' : 'back'}`} aria-hidden={hidden} inert={hidden}>
        <Panel
          title="Production by shift"
          sub={props.sub}
          right={
            <span className="rm-shift-head">
              <Seg
                label="Shift view"
                value={view}
                onChange={setView}
                options={[
                  { id: 'shift', label: 'By shift', title: 'Each shift against its plan' },
                  { id: 'day', label: 'Whole day', title: 'All shifts together against the day’s plan' },
                ]}
              />
              {props.planMt === null
                ? <span className="chip chip--na" title="No plan for this period">Plan NA</span>
                : <span className="chip chip--info">Plan {fixed(props.planMt, 0)} MT</span>}
            </span>
          }
          className="rm-panel"
          bodyClass="rm-body"
        >
          <Bars
            rows={v === 'shift' ? props.shifts : [{ name: 'Total', ...props.day }]}
            label={v === 'shift' ? 'Production by shift, plan vs actual per day' : 'Whole-day production, plan vs actual per day'}
            onOpen={open}
          />
          <div className="rm-foot">
            {props.rate}
            {open ? (
              <button type="button" className="rm-foot-item rm-foot-btn" onClick={open} aria-haspopup="dialog" title="Plan vs actual per shift, per day">
                <PlanGap v={props.planGapMt} />
              </button>
            ) : (
              <span className="rm-foot-item"><PlanGap v={props.planGapMt} /></span>
            )}
          </div>
        </Panel>
      </div>
    );
  };

  return (
    <div className={`rm-flip${flipped ? ' is-flipped' : ''}`}>
      <div className="rm-flip-inner">
        {face('shift')}
        {face('day')}
      </div>
    </div>
  );
}

/** Output bars against the target line, each with its compliance. */
function Bars({ rows, label, onOpen }: { rows: ShiftBar[]; label: string; onOpen?: () => void }) {
  const plans = rows.map((s) => s.planMt ?? 0);
  const scale = Math.max(...plans, ...rows.map((s) => s.outputMt ?? 0)) * SCALE_OVER_TARGET || 1;
  const pctOf = (x: number | null) => `${Math.min(100, ((x ?? 0) / scale) * 100)}%`;
  // One label for the target line when every row shares it, as on the comp.
  const commonPlan = plans.every((p) => p === plans[0]) ? rows[0]?.planMt ?? null : null;
  const openOnKey = (e: KeyboardEvent) => { if (onOpen && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } };

  return (
    <div
      className={`rm-shifts${onOpen ? ' rm-shifts--button' : ''}`}
      style={{ ['--target' as string]: pctOf(commonPlan) }}
      {...(onOpen ? {
        role: 'button', tabIndex: 0, 'aria-haspopup': 'dialog' as const, 'aria-label': label,
        title: 'Plan vs actual, per day', onClick: onOpen, onKeyDown: openOnKey,
      } : {})}
    >
      <div className="rm-shift-target-label" aria-hidden>
        {commonPlan !== null ? <span>{fixed(commonPlan, 0)} MT target</span> : <span />}
        <span className="rm-shift-col">Compliance</span>
      </div>
      {rows.map((s) => (
        <div className="rm-shift" key={s.name} style={{ ['--target' as string]: pctOf(s.planMt) }}>
          <span className="rm-shift-name">{s.name}</span>
          <span
            className="rm-shift-track"
            role="img"
            aria-label={`${s.name}: ${fixed(s.outputMt, 1)} MT against ${fixed(s.planMt, 0)} MT target, compliance ${s.compliancePct === null ? 'NA' : `${fixed(s.compliancePct, 1)}%`}`}
          >
            <i className="rm-shift-fill" style={{ width: pctOf(s.outputMt) }} />
            {s.planMt !== null && <i className="rm-shift-target" />}
          </span>
          <span className={`rm-shift-val num ${s.outputMt === null ? 'v-na' : 'v-val'}`}>
            {s.outputMt === null ? 'NA' : `${fixed(s.outputMt, 1)} MT`}
            {/* Rows with different targets (e.g. the plan puts it all on one shift): each says its own. */}
            {commonPlan === null && s.planMt !== null && <span className="rm-shift-of"> / {fixed(s.planMt, 0)}</span>}
          </span>
          <span className={`rm-shift-comp num ${s.compliancePct === null ? 'v-na' : s.compliancePct >= 100 ? 'v-ok' : 'v-warn'}`}>
            {s.compliancePct === null ? 'NA' : `${fixed(s.compliancePct, 1)}%`}
          </span>
        </div>
      ))}
    </div>
  );
}

function PlanGap({ v }: { v: number | null }) {
  return (
    <>
      <span className="rm-k">Plan gap</span>
      <span className={`rm-foot-v num ${v === null ? 'v-na' : v > 0 ? 'v-warn' : 'v-ok'}`}>
        {v === null ? 'NA' : `${fixed(v, 1)} MT`}
      </span>
    </>
  );
}
