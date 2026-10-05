'use client';

/**
 * Billets in against strip out, and where the difference went — from the ERP Production
 * Log Sheet for the Duration filter's period. Every figure opens the drawer that shows it
 * per day beside the check that proves it (input = production + the four losses).
 */
import { useState, type ReactNode } from 'react';
import Panel from '@/components/Panel';
import { fixed } from '@/lib/num';
import { useLogSheetDrawer } from '@/components/drill/LogSheetDrawer';
import CounterDrawer, { BILLET_COUNTER } from '@/components/drill/CounterDrawer';
import { useErpPeriod } from '@/components/production/useErpPeriod';

export default function MaterialBalance() {
  const { current, loading, note } = useErpPeriod();
  const logSheet = useLogSheetDrawer();
  const [billets, setBillets] = useState(false);
  const t = current?.totals;
  const has = !!t?.entryDays;
  /** Value with its unit; a missing value is a bare NA, not "NA MT". */
  const vu = (x: number | null | undefined, unit: string) => (has ? `${fixed(x, 1)}${unit}` : 'NA');
  const lossPct = has && t!.inputMt ? (t!.massDiffMt! / t!.inputMt) * 100 : null;
  const balanced = has && t!.balanceOkDays === t!.entryDays;

  return (
    <Panel
      title="Material & operating balance"
      sub="ERP log sheet · Duration period"
      right={<span className={`chip ${has ? (balanced ? 'chip--ok' : 'chip--warn') : 'chip--na'}`} title={note}>
        {has ? (balanced ? 'Balances ✓' : `Balances ${t!.balanceOkDays}/${t!.entryDays} days`) : 'Not in ERP yet'}
      </span>}
      className="rm-panel"
      bodyClass="rm-body"
    >
      <div className="rm-balance">
        <Stat label="Billet input" onOpen={() => logSheet.open('balance')} loading={loading} title="Billet input per day and its split">
          <span className="rm-stat num v-val">{vu(t?.inputMt, ' MT')}</span>
        </Stat>
        <Stat label="Finished" onOpen={() => logSheet.open('quality')} loading={loading} title="Production, prime/defective split and stores check per day">
          <span className="rm-stat num rm-text--order">{vu(t?.productionMt, ' MT')}</span>
        </Stat>
        <Stat label="Mass difference" onOpen={() => logSheet.open('balance')} loading={loading} title="Where the difference went, per day">
          <span className="rm-stat num v-warn">{vu(t?.massDiffMt, ' MT')}</span>
          <span className="rm-stat-note num">{lossPct === null ? note : `${fixed(lossPct, 1)}% of input`}</span>
        </Stat>
        <Stat label="Billets" onOpen={() => setBillets(true)} loading={loading} title="ERP billet count against the mill counter">
          <span className="rm-stat num v-val">{has ? fixed(t!.inputPcs, 0) : 'NA'}</span>
          <span className="rm-stat-note num">{has ? `${fixed(t!.productionPcs, 0)} coils out` : ''}</span>
        </Stat>
      </div>

      <div className="rm-ops" role="group" aria-label="Yield and losses">
        <Op label="Yield" yieldTone value={vu(t?.yieldPct, '%')} onOpen={() => logSheet.open('yield')} />
        <Op label="Burning loss" value={vu(t?.burningLossMt, ' MT')} onOpen={() => logSheet.open('balance')} />
        <Op label="End cut" value={vu(t?.endCutMt, ' MT')} onOpen={() => logSheet.open('balance')} />
        <Op label="Miss-roll" value={vu(t?.missRollMt, ' MT')} onOpen={() => logSheet.open('balance')} />
        <Op label="Reject" value={vu(t?.rejectMt, ' MT')} onOpen={() => logSheet.open('balance')} />
      </div>

      {logSheet.drawer}
      <CounterDrawer open={billets} onClose={() => setBillets(false)} config={BILLET_COUNTER} />
    </Panel>
  );
}

function Stat(props: { label: string; onOpen: () => void; loading: boolean; title: string; children: ReactNode }) {
  return (
    <button type="button" className="rm-stat-btn" onClick={props.onOpen} aria-haspopup="dialog" title={props.title}>
      <span className="rm-k">{props.label}</span>
      {props.loading ? <span className="skel skel--num" role="status" aria-label="Loading" /> : props.children}
    </button>
  );
}

function Op(props: { label: string; value: string; onOpen: () => void; yieldTone?: boolean }) {
  return (
    <button type="button" className={`rm-op-btn${props.yieldTone ? ' rm-ops-yield' : ''}`} onClick={props.onOpen} aria-haspopup="dialog">
      <span className="rm-op-k">{props.label}</span>
      <span className="rm-op-v num">{props.value}</span>
    </button>
  );
}
