import { Fragment } from 'react';
import Panel from '@/components/Panel';
import { fixed } from '@/lib/num';
import type { HsmValues } from './hsmValues';

type Zone =
  | { kind: 'count'; key: string; title: string; value: string; foot: string }
  | { kind: 'group'; key: string; title: string; state: string; foot: string };

/** A running group is in band; anything else is the operator's to look at. */
const stateTone = (s: string) => (s.toLowerCase() === 'running' ? 'ok' : s.toLowerCase() === 'idle' ? 'na' : 'risk');

/**
 * Grouped process zones, billet infeed to finished exit. Stand-level detail waits on the
 * stand map, which the panel head says outright.
 */
export default function MillMimic({ v }: { v: HsmValues }) {
  const zones: Zone[] = [
    { kind: 'count', key: 'infeed', title: 'Billet infeed', value: `${v.billets} billets`, foot: 'Counter / entry' },
    { kind: 'group', key: 'roughing', title: 'Roughing group', state: v.mimic.roughing, foot: 'Group status' },
    { kind: 'group', key: 'intermediate', title: 'Intermediate group', state: v.mimic.intermediate, foot: 'Group status' },
    { kind: 'group', key: 'finishing', title: 'Finishing group', state: v.mimic.finishing, foot: 'Group status' },
    { kind: 'count', key: 'exit', title: 'Finished exit', value: `${fixed(v.production, 1)} MT`, foot: 'ERP production' },
  ];

  return (
    <Panel
      title="Mill mimic"
      sub="Grouped process zones · representative running state"
      right={<span className="chip chip--na">Stand map pending</span>}
    >
      <ol className="rm-mimic" aria-label="Mill process flow">
        {zones.map((z, i) => (
          <Fragment key={z.key}>
            {i > 0 && <li className="rm-mimic-arrow" aria-hidden><FlowArrow /></li>}
            <li className={`rm-zone ${z.kind === 'group' ? `rm-zone--${stateTone(z.state)}` : 'rm-zone--flow'}`}>
              <span className="rm-zone-title">{z.title}</span>
              <span className="rm-zone-body">
                {z.kind === 'group' ? (
                  <>
                    <span className={`rm-zone-value rm-zone-state v-val`}>{z.state}</span>
                    <StandGlyph />
                  </>
                ) : (
                  <span className="rm-zone-value num v-val">{z.value}</span>
                )}
              </span>
              <span className="rm-zone-foot">{z.foot}</span>
            </li>
          </Fragment>
        ))}
      </ol>
    </Panel>
  );
}

function FlowArrow() {
  return (
    <svg width="28" height="12" viewBox="0 0 28 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 6h25M21 1.5 26 6l-5 4.5" />
    </svg>
  );
}

/** A roll pair seen end-on — the stand group. Takes the zone's status colour. */
function StandGlyph() {
  return (
    <svg className="rm-zone-glyph" width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <rect x="4" y="2" width="5" height="18" rx="2.5" fill="currentColor" opacity="0.9" />
      <rect x="13" y="2" width="5" height="18" rx="2.5" fill="currentColor" opacity="0.9" />
      <rect x="5.2" y="3.4" width="1.6" height="15" rx="0.8" fill="#ffffff" opacity="0.28" />
      <rect x="14.2" y="3.4" width="1.6" height="15" rx="0.8" fill="#ffffff" opacity="0.28" />
    </svg>
  );
}
