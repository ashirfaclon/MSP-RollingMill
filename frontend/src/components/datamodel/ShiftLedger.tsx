import Panel from '@/components/Panel';
import { fixed } from '@/lib/num';
import { fmtIst } from '@/lib/time';
import type { MillModel } from '@/models/millModel';

/**
 * Per-shift material and running time. Output is credited to the shift that rolled it;
 * run hours come from the drive power split at the shift boundaries.
 */
export default function ShiftLedger({ m }: { m: MillModel }) {
  const k = m.kpis;
  const gapClass = (g: number | null) => (g === null ? 'v-na' : g > 0 ? 'v-warn' : 'v-ok');
  return (
    <Panel title="Shifts" sub="Material per shift · run hours from power" className="rm-panel" bodyClass="dm-body">
      <div className="dm-scroll">
        <table className="grid dm-table" aria-label="Shift ledger">
          <thead>
            <tr>
              <th>Shift</th>
              <th className="r">Billets</th>
              <th className="r">Fed</th>
              <th className="r" title="Inline reject">Inline</th>
              <th className="r">Output</th>
              <th className="r">Plan</th>
              <th className="r">Gap</th>
              <th className="r">Run</th>
              <th className="r">TPH</th>
              <th className="r">Yield</th>
            </tr>
          </thead>
          <tbody>
            {m.shifts.map((s) => (
              <tr key={s.name}>
                <td><b>Shift {s.name}</b> <span className="dm-sub dm-sub-line">{fmtIst(s.fromMs)}–{fmtIst(s.toMs)}</span></td>
                <td className="num r v-val">{s.fed.count ?? 'NA'}</td>
                <td className="num r v-val">{fixed(s.fed.mt, 1)}</td>
                <td className="num r v-val">{fixed(s.inlineReject.mt, 1)}</td>
                <td className="num r v-val">{fixed(s.output.mt, 1)}</td>
                <td className="num r">{fixed(s.planMt, 0)}</td>
                <td className={`num r ${gapClass(s.planGap)}`}>{fixed(s.planGap, 1)}</td>
                <td className="num r v-val">{fixed(s.run.runH, 1)} h</td>
                <td className="num r v-val">{fixed(s.runningRateTph, 2)}</td>
                <td className="num r v-val">{fixed(s.yieldPct, 1)}%</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td><b>Day</b></td>
              <td className="num r v-val">{k.billetsFed ?? 'NA'}</td>
              <td className="num r v-val">{fixed(k.billetInputMt, 1)}</td>
              <td className="num r v-val">{fixed(k.inlineRejectMt, 1)}</td>
              <td className="num r v-val">{fixed(k.productionMt, 1)}</td>
              <td className="num r">{fixed(k.planMt, 0)}</td>
              <td className={`num r ${gapClass(k.planGapMt)}`}>{fixed(k.planGapMt, 1)}</td>
              <td className="num r v-val">{fixed(k.runH, 1)} h</td>
              <td className="num r v-val">{fixed(k.runningRateTph, 2)}</td>
              <td className="num r v-val">{fixed(k.yieldPct, 1)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="dm-foot">MT throughout. Gap = plan − output. Yield = output ÷ billets fed.</p>
    </Panel>
  );
}
