'use client';

/**
 * The process twins drawn from the scenario fixtures (mill-mimic-improvement-spec §6), for the
 * lane-collision, reduced-motion and theme tests and for looking at a case by eye:
 * /twin/fixtures?mill=rmd&id=routeInconsistent. Nothing here polls.
 */
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import Panel from '@/components/Panel';
import ProcessTwin from '@/components/twin/ProcessTwin';
import { HSM_FIXTURES, NOW, RMD_FIXTURES, type HsmFixtureId, type RmdFixtureId } from '@/components/twin/twinFixtures';
import { hsmTwinModel, rmdTwinModel } from '@/components/twin/twinModel';

function Fixture() {
  const q = useSearchParams();
  const mill = q.get('mill') === 'rmd' ? 'rmd' : 'hsm';
  const id = q.get('id') ?? 'rolling';
  const [selected, setSelected] = useState<string | null>(null);
  const model = mill === 'hsm'
    ? hsmTwinModel(HSM_FIXTURES[id as HsmFixtureId] ?? HSM_FIXTURES.rolling, 1234.5, NOW, false)
    : (() => { const f = RMD_FIXTURES[id as RmdFixtureId] ?? RMD_FIXTURES.rolling; return rmdTwinModel(f.live, f.mps, 2210.4, NOW, false); })();
  return (
    <main className="rm-viz" style={{ padding: 16 }}>
      <Panel title={`Mill mimic · ${mill.toUpperCase()} · ${id}`} sub={`${model.totals.on} of ${model.totals.total} on`}>
        <ProcessTwin model={model} onOpen={() => {}} selected={selected} onSelect={setSelected} />
      </Panel>
    </main>
  );
}

export default function TwinFixturesPage() {
  return <Suspense fallback={null}><Fixture /></Suspense>;
}
