import Panel from '@/components/Panel';
import { fixed } from '@/lib/num';
import type { HsmDerived, HsmValues } from './hsmValues';

/** Headroom past the shift target, so a shift over target still has track to fill. */
const SCALE_OVER_TARGET = 1.25;

/** Finished output per shift against an equal share of the plan. */
export default function ShiftProduction({ v, d }: { v: HsmValues; d: HsmDerived }) {
  const scale = d.shiftTarget * SCALE_OVER_TARGET;
  const targetPct = (d.shiftTarget / scale) * 100;
  const pct = (x: number) => `${Math.min(100, (x / scale) * 100)}%`;

  return (
    <Panel
      title="Production by shift"
      sub="Finished output against equal shift plan"
      right={<span className="chip chip--info">Plan {fixed(v.plan, 0)} MT</span>}
      className="rm-panel"
      bodyClass="rm-body"
    >
      <div className="rm-shifts" style={{ ['--target' as string]: `${targetPct}%` }}>
        <div className="rm-shift-target-label" aria-hidden>
          <span>{fixed(d.shiftTarget, 0)} MT target</span>
        </div>
        {v.shifts.map((s) => (
          <div className="rm-shift" key={s.name}>
            <span className="rm-shift-name">{s.name}</span>
            <span
              className="rm-shift-track"
              role="img"
              aria-label={`${s.name}: ${fixed(s.production, 1)} MT against ${fixed(d.shiftTarget, 0)} MT target`}
            >
              <i className="rm-shift-fill" style={{ width: pct(s.production) }} />
              <i className="rm-shift-target" />
            </span>
            <span className="rm-shift-val num v-val">{fixed(s.production, 1)} MT</span>
          </div>
        ))}
      </div>

      <div className="rm-foot">
        <span className="rm-foot-item">
          <span className="rm-k">Running rate</span>
          <span className="rm-foot-v num v-val">{fixed(d.runRateTph, 2)} TPH</span>
        </span>
        <span className="rm-foot-item">
          <span className="rm-k">Plan gap</span>
          <span className={`rm-foot-v num ${d.planGap > 0 ? 'v-warn' : 'v-ok'}`}>{fixed(d.planGap, 1)} MT</span>
        </span>
      </div>
    </Panel>
  );
}
