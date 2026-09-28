import Panel from '@/components/Panel';
import { fixed } from '@/lib/num';
import type { HsmDerived, HsmValues } from './hsmValues';

/** Billets in against finished out, and the running time that turned one into the other. */
export default function MaterialBalance({ v, d }: { v: HsmValues; d: HsmDerived }) {
  return (
    <Panel title="Material & operating balance" className="rm-panel" bodyClass="rm-body">
      <dl className="rm-balance">
        <div>
          <dt className="rm-k">Billet input</dt>
          <dd className="rm-stat num v-val">{fixed(v.billetInput, 1)} MT</dd>
        </div>
        <div>
          <dt className="rm-k">Finished</dt>
          <dd className="rm-stat num rm-text--order">{fixed(v.production, 1)} MT</dd>
        </div>
        <div>
          <dt className="rm-k">Mass difference</dt>
          <dd className="rm-stat num v-warn">{fixed(d.massDiff, 1)} MT</dd>
        </div>
        <div>
          <dt className="rm-k">Billets</dt>
          <dd className="rm-stat num v-val">{v.billets}</dd>
        </div>
      </dl>

      <dl className="rm-ops">
        <div className="rm-ops-yield">
          <dt>Yield</dt>
          <dd className="num">{fixed(d.yieldPct, 1)}%</dd>
        </div>
        <div>
          <dt>Billet rate</dt>
          <dd className="num">{fixed(d.billetRate, 2)}/h</dd>
        </div>
        <div>
          <dt>Run</dt>
          <dd className="num">{fixed(v.runHours, 1)} h</dd>
        </div>
        <div>
          <dt>Non-run</dt>
          <dd className="num">{fixed(v.nonRunHours, 1)} h</dd>
        </div>
        <div>
          <dt>Avail.</dt>
          <dd className="num">{fixed(d.availabilityPct, 1)}%</dd>
        </div>
      </dl>
    </Panel>
  );
}
