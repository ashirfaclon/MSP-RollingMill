import Panel from '@/components/Panel';
import { fixed } from '@/lib/num';
import type { MillModel } from '@/models/millModel';

/** Headroom past the largest shift target, so a shift over target still has track to fill. */
const SCALE_OVER_TARGET = 1.25;

/** Finished output per shift against its share of the plan. No live source yet (the ERP has no shift split): shows 0. */
export default function ShiftProduction({ m }: { m: MillModel }) {
  const plans = m.shifts.map((s) => s.planMt ?? 0);
  const scale = Math.max(...plans, ...m.shifts.map((s) => s.output.mt ?? 0)) * SCALE_OVER_TARGET || 1;
  const pctOf = (x: number | null) => `${Math.min(100, ((x ?? 0) / scale) * 100)}%`;
  // One label for the target line when every shift shares it, as on the comp.
  const commonPlan = plans.every((p) => p === plans[0]) ? m.shifts[0]?.planMt ?? null : null;

  return (
    <Panel
      title="Production by shift"
      sub="Finished output against equal shift plan"
      right={<span className="chip chip--info">Plan {fixed(m.kpis.planMt, 0)} MT</span>}
      className="rm-panel"
      bodyClass="rm-body"
    >
      <div className="rm-shifts" style={{ ['--target' as string]: pctOf(commonPlan) }}>
        {commonPlan !== null && (
          <div className="rm-shift-target-label" aria-hidden>
            <span>{fixed(commonPlan, 0)} MT target</span>
          </div>
        )}
        {m.shifts.map((s) => (
          <div className="rm-shift" key={s.name} style={{ ['--target' as string]: pctOf(s.planMt) }}>
            <span className="rm-shift-name">Shift {s.name}</span>
            <span
              className="rm-shift-track"
              role="img"
              aria-label={`Shift ${s.name}: ${fixed(s.output.mt, 1)} MT against ${fixed(s.planMt, 0)} MT target`}
            >
              <i className="rm-shift-fill" style={{ width: pctOf(s.output.mt) }} />
              {s.planMt !== null && <i className="rm-shift-target" />}
            </span>
            <span className="rm-shift-val num v-val">{fixed(s.output.mt, 1)} MT</span>
          </div>
        ))}
      </div>

      <div className="rm-foot">
        <span className="rm-foot-item">
          <span className="rm-k">Running rate</span>
          <span className="rm-foot-v num v-val">{fixed(m.kpis.runningRateTph, 2)} TPH</span>
        </span>
        <span className="rm-foot-item">
          <span className="rm-k">Plan gap</span>
          <span className={`rm-foot-v num ${(m.kpis.planGapMt ?? 0) > 0 ? 'v-warn' : 'v-ok'}`}>
            {fixed(m.kpis.planGapMt, 1)} MT
          </span>
        </span>
      </div>
    </Panel>
  );
}
