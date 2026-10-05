import Panel from '@/components/Panel';
import { fixed } from '@/lib/num';
import { fmtDuration, fmtIst } from '@/lib/time';
import type { MillModel } from '@/models/millModel';

const H = 3_600_000;

/**
 * Run time from drive power: a 24-hour strip with each stop drawn where it happened,
 * the shift boundaries, and the settings that decide what counts as a stop.
 */
export default function RunTimePanel({ m }: { m: MillModel }) {
  const { run, window } = m;
  const { meter, detection: { idleKw, minStopMin } } = m.power;
  const span = window.toMs - window.fromMs;
  const at = (ms: number) => `${((ms - window.fromMs) / span) * 100}%`;
  const ticks = Array.from({ length: Math.floor(span / (4 * H)) + 1 }, (_, i) => window.fromMs + i * 4 * H);
  const shiftOf = (ms: number) => m.shifts.find((s) => ms >= s.fromMs && ms < s.toMs)?.name ?? '–';

  return (
    <Panel title="Run time from power" sub={meter} className="rm-panel" bodyClass="dm-body">
      <div className="dm-tl" role="img"
        aria-label={`${run.stops.length} stops totalling ${fixed(run.stopH, 1)} h in the day`}>
        <div className="dm-tl-track">
          {m.shifts.map((s) => (
            <span key={s.name} className="dm-tl-shift" style={{ left: at(s.fromMs), width: at(window.fromMs + (s.toMs - s.fromMs)) }}>
              Shift {s.name}
            </span>
          ))}
          {run.stops.map((st) => (
            <i key={st.fromMs} className="dm-tl-stop"
              style={{ left: at(st.fromMs), width: at(window.fromMs + (st.toMs - st.fromMs)) }}
              title={`Stop ${fmtIst(st.fromMs)}–${fmtIst(st.toMs)} · ${fmtDuration(st.toMs - st.fromMs)}`} />
          ))}
        </div>
        <div className="dm-tl-ticks" aria-hidden>
          {ticks.map((t) => <span key={t} style={{ left: at(t) }}>{fmtIst(t)}</span>)}
        </div>
      </div>

      <dl className="dm-stats">
        <div><dt className="rm-k">Run</dt><dd className="num v-val">{fixed(run.runH, 1)} h</dd></div>
        <div><dt className="rm-k">Non-run</dt><dd className="num v-warn">{fixed(run.stopH, 1)} h</dd></div>
        <div><dt className="rm-k">Availability</dt><dd className="num v-val">{fixed(m.kpis.availabilityPct, 1)}%</dd></div>
        <div><dt className="rm-k">Energy</dt><dd className="num v-val">{fixed(run.energyMwh, 2)} MWh</dd></div>
        <div><dt className="rm-k">Idle energy</dt><dd className="num v-warn">{fixed(run.idleEnergyMwh, 2)} MWh</dd></div>
      </dl>

      <div className="dm-scroll">
        <table className="grid dm-table" aria-label="Stops">
          <thead>
            <tr><th>Stop</th><th>Shift</th><th className="r">Duration</th></tr>
          </thead>
          <tbody>
            {run.stops.map((st) => (
              <tr key={st.fromMs}>
                <td className="num v-val">{fmtIst(st.fromMs)}–{fmtIst(st.toMs)}</td>
                <td>{shiftOf(st.fromMs)}</td>
                <td className="num r v-val">{fmtDuration(st.toMs - st.fromMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="dm-foot">
        Running = drive power above {fixed(idleKw, 0)} kW. Dips shorter than {minStopMin} min are gaps between
        billets, not stops.
      </p>
    </Panel>
  );
}
