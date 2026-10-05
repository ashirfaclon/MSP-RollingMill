import Panel from '@/components/Panel';
import { fixed } from '@/lib/num';
import type { MillModel } from '@/models/millModel';
import CheckMark from './CheckMark';

/** Which ledger a check belongs to, from its id prefix. */
const AREA: [RegExp, string][] = [
  [/^(fed|output|qc|accepted)/, 'Material flow'],
  [/^shifts\./, 'Shifts'],
  [/^power\./, 'Run time'],
  [/^stock\./, 'Stock'],
  [/^order\./, 'Orders'],
];
const areaOf = (id: string) => AREA.find(([re]) => re.test(id))?.[1] ?? 'Other';

/**
 * Every balance the model enforces, in one list. A failing row is the first thing to
 * read when a KPI looks wrong: it names the ledger and the gap.
 */
export default function ModelChecks({ m }: { m: MillModel }) {
  const passed = m.checks.filter((c) => c.ok === true).length;
  const failed = m.checks.filter((c) => c.ok === false).length;
  const tone = failed > 0 ? 'risk' : passed === m.checks.length ? 'ok' : 'na';
  // Failures first, then by ledger in model order.
  const rows = [...m.checks].sort((a, b) => Number(a.ok !== false) - Number(b.ok !== false));
  const v = (x: number | null) => fixed(x, 1);

  return (
    <Panel
      title="Balance checks"
      sub="Every total the model expects to add up"
      right={<span className={`chip chip--${tone}`}>{passed} of {m.checks.length} pass</span>}
      className="rm-panel"
      bodyClass="dm-body"
    >
      <div className="dm-scroll dm-scroll--checks">
        <table className="grid dm-table" aria-label="Balance checks">
          <thead>
            <tr>
              <th>Ledger</th>
              <th>Check</th>
              <th className="r">Total</th>
              <th className="r">Parts</th>
              <th className="r">Gap</th>
              <th className="c">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="dm-sub">{areaOf(c.id)}</td>
                <td>{c.label}</td>
                <td className="num r v-val">{v(c.total)}</td>
                <td className="num r v-val">{v(c.parts)}</td>
                <td className={`num r ${c.ok === false ? 'v-risk' : ''}`}>{v(c.gap)}</td>
                <td className="c"><CheckMark ok={c.ok} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
