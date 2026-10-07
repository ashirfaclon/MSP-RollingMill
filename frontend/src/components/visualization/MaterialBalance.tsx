'use client';

/**
 * Billets in against strip out, and where the difference went — the ERP Production Log
 * Sheet for the Duration filter's period, drawn as a mass balance:
 *
 *   input bar    [ finished ──────────────────────────────── | difference ]
 *                                                             ╲            ╲
 *   loss bar     [ burning loss | end cut | miss-roll | reject            ]
 *
 * Each loss is 1–5 % of the input — a sliver on the input bar — so the difference is
 * opened out into its own full-width bar, where the biggest loss stands out at a glance.
 * Both bars keep true proportions. Every figure opens the drawer that shows it per day
 * beside the check that proves it (input = production + the four losses).
 */
import { useState, type ReactNode } from 'react';
import Panel from '@/components/Panel';
import { fixed } from '@/lib/num';
import { useLogSheetDrawer } from '@/components/drill/LogSheetDrawer';
import CounterDrawer, { BILLET_COUNTER } from '@/components/drill/CounterDrawer';
import { useErpPeriod } from '@/components/production/useErpPeriod';
import type { LogPeriod } from '@/services/hsmApi';
import type { Series } from './KpiCard';

/** The four losses the log sheet books, in rolling order. Colours match the log-sheet drawer. */
const LOSSES: { key: keyof LogPeriod; label: string; series: Series; hint: string }[] = [
  { key: 'burningLossMt', label: 'Burning loss', series: 'bloss', hint: 'Mill scale — burnt off every billet in the furnace' },
  { key: 'endCutMt', label: 'End cut', series: 'endcut', hint: 'Strip ends cropped off every coil' },
  { key: 'missRollMt', label: 'Miss-roll', series: 'missroll', hint: 'Pieces lost in the mill (miss-roll strip)' },
  { key: 'rejectMt', label: 'Reject', series: 'reject', hint: 'Pieces rejected at the finish (strip finish end cut)' },
];

/** Smallest remainder worth drawing — the ERP's own rounding. */
const MIN_MT = 0.05;

const pct = (v: number | null | undefined, of: number | null | undefined) =>
  v === null || v === undefined || !of ? 0 : (v / of) * 100;
const mt = (v: number | null | undefined) => `${fixed(v, 1)} MT`;

export default function MaterialBalance() {
  const { current, loading, note } = useErpPeriod();
  const logSheet = useLogSheetDrawer();
  const [billets, setBillets] = useState(false);
  const t = current?.totals;
  const has = !!t?.entryDays;
  const balanced = has && t!.balanceOkDays === t!.entryDays;

  // Input bar: finished | difference, as shares of the input.
  const finishedPct = has ? pct(t!.productionMt, t!.inputMt) : 0;
  const diffPct = has ? pct(t!.massDiffMt, t!.inputMt) : 0;

  // Loss bar: the difference opened out. Scaled to whichever is larger, the four losses
  // or the difference, so a day where they don't add up shows the gap instead of hiding it.
  const losses = LOSSES.map((l) => ({ ...l, value: has ? (t![l.key] as number | null) ?? 0 : 0 }));
  const lossSum = losses.reduce((a, l) => a + l.value, 0);
  const diff = has ? t!.massDiffMt ?? 0 : 0;
  const unaccounted = diff - lossSum;
  const lossScale = Math.max(lossSum, diff, 0);

  const inputLabel = has
    ? `Billet input ${mt(t!.inputMt)}: finished ${mt(t!.productionMt)} (${fixed(t!.yieldPct, 1)}% yield), mass difference ${mt(t!.massDiffMt)} (${fixed(diffPct, 1)}% of input)`
    : 'Billet input: not in ERP yet';
  const lossLabel = has
    ? `Mass difference ${mt(diff)}: ${losses.map((l) => `${l.label.toLowerCase()} ${mt(l.value)}`).join(', ')}${unaccounted > MIN_MT ? `, unaccounted ${mt(unaccounted)}` : ''}`
    : 'Losses: not in ERP yet';

  return (
    <Panel
      title="Material & operating balance"
      right={<span className={`chip ${has ? (balanced ? 'chip--ok' : 'chip--warn') : 'chip--na'}`} title={note}>
        {has ? (balanced ? 'Balances ✓' : `Balances ${t!.balanceOkDays}/${t!.entryDays} days`) : 'Not in ERP yet'}
      </span>}
      className="rm-panel"
      bodyClass="rm-body"
    >
      <div className="rm-mb">
        {/* Input: billets in, and the yield they gave. */}
        <div className="rm-mb-head">
          <Figure label="Billet input" value={has ? mt(t!.inputMt) : 'NA'} loading={loading}
            onOpen={() => logSheet.open('balance')} title="Billet input per day and its split" />
          <Figure label="Yield" value={has ? `${fixed(t!.yieldPct, 1)}%` : 'NA'} loading={loading} tone="order" align="end"
            onOpen={() => logSheet.open('yield')} title="Yield per day, ERP beside the mill counter" />
        </div>
        <span className="rm-mb-bar rm-mb-bar--input" role="img" aria-label={inputLabel}>
          <i className="rm-mb-seg rm-tone--order" style={{ width: `${finishedPct}%` }} title={has ? `Finished ${mt(t!.productionMt)}` : undefined} />
          <i className="rm-mb-seg rm-tone--diff" style={{ width: `${diffPct}%` }} title={has ? `Mass difference ${mt(t!.massDiffMt)}` : undefined} />
        </span>
        <div className="rm-mb-labels">
          <Link tone="order" onOpen={() => logSheet.open('quality')} title="Production, prime/defective split and stores check per day">
            Finished <b className="num">{has ? mt(t!.productionMt) : 'NA'}</b>
          </Link>
          <Link tone="diff" onOpen={() => logSheet.open('balance')} title="Where the difference went, per day">
            Mass difference <b className="num">{has ? mt(t!.massDiffMt) : 'NA'}</b>
            {has && <>{' '}<span className="rm-mb-dim num">· {fixed(diffPct, 1)}% of input</span></>}
          </Link>
        </div>

        {/* The difference, opened out to full width. */}
        <svg className="rm-mb-zoom" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden style={{ visibility: has && diff > MIN_MT ? 'visible' : 'hidden' }}>
          <polygon className="rm-mb-zoom-fill" points={`${finishedPct},0 100,0 100,10 0,10`} />
          <line className="rm-mb-zoom-edge" x1={finishedPct} y1="0" x2="0" y2="10" vectorEffect="non-scaling-stroke" />
          <line className="rm-mb-zoom-edge" x1="100" y1="0" x2="100" y2="10" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="rm-mb-bar rm-mb-bar--loss" role="img" aria-label={lossLabel}>
          {losses.map((l) => (
            <i key={l.key} className={`rm-mb-seg rm-tone--${l.series}`} style={{ width: `${pct(l.value, lossScale)}%` }} title={`${l.label} ${mt(l.value)}`} />
          ))}
          {unaccounted > MIN_MT && (
            <i className="rm-mb-seg rm-mb-seg--gap rm-tone--loss" style={{ width: `${pct(unaccounted, lossScale)}%` }} title={`Unaccounted ${mt(unaccounted)}`} />
          )}
        </span>
        <div className="rm-mb-legend" role="group" aria-label="Losses">
          {losses.map((l) => (
            <Link key={l.key} tone={l.series} dot onOpen={() => logSheet.open('balance')} title={l.hint}>
              {l.label} <b className="num">{has ? mt(l.value) : 'NA'}</b>
              {has && <>{' '}<span className="rm-mb-dim num">{fixed(pct(l.value, t!.inputMt), 1)}%</span></>}
            </Link>
          ))}
          {unaccounted > MIN_MT && (
            <Link tone="loss" dot onOpen={() => logSheet.open('balance')} title="Difference the four losses do not explain — see the balance check per day">
              Unaccounted <b className="num">{mt(unaccounted)}</b>
            </Link>
          )}
        </div>
        {!has && !loading && <p className="rm-mb-note">{note}</p>}

        {/* Pieces: the same balance counted in billets and coils. */}
        <button type="button" className="rm-mb-pieces" onClick={() => setBillets(true)} aria-haspopup="dialog" title="ERP billet count against the mill counter">
          <span className="rm-k">Billets</span>
          {loading
            ? <span className="skel skel--num" role="status" aria-label="Loading" />
            : <span className="rm-mb-pieces-v num">{has ? <><b>{fixed(t!.inputPcs, 0)}</b> in · <b className="rm-text--order">{fixed(t!.productionPcs, 0)}</b> coils out</> : 'NA'}</span>}
          <span className="rm-mb-bar rm-mb-bar--pieces" aria-hidden>
            <i className="rm-mb-seg rm-tone--order" style={{ width: `${has ? pct(t!.productionPcs, t!.inputPcs) : 0}%` }} />
            <i className="rm-mb-seg rm-tone--diff" style={{ width: `${has ? Math.max(0, 100 - pct(t!.productionPcs, t!.inputPcs)) : 0}%` }} />
          </span>
        </button>
      </div>

      {logSheet.drawer}
      <CounterDrawer open={billets} onClose={() => setBillets(false)} config={BILLET_COUNTER} />
    </Panel>
  );
}

/** A headline figure that opens its drawer. */
function Figure(props: { label: string; value: string; loading: boolean; onOpen: () => void; title: string; tone?: Series; align?: 'end' }) {
  return (
    <button type="button" className={`rm-mb-figure${props.tone ? ` rm-tone--${props.tone}` : ''}${props.align ? ' rm-mb-figure--end' : ''}`}
      onClick={props.onOpen} aria-haspopup="dialog" title={props.title}>
      <span className="rm-k">{props.label}</span>
      {props.loading ? <span className="skel skel--num" role="status" aria-label="Loading" /> : <span className="rm-mb-figure-v num">{props.value}</span>}
    </button>
  );
}

/** A bar's caption or a legend entry — clickable, coloured like its segment. */
function Link(props: { tone: Series; dot?: boolean; onOpen: () => void; title: string; children: ReactNode }) {
  return (
    <button type="button" className={`rm-mb-link rm-tone--${props.tone}`} onClick={props.onOpen} aria-haspopup="dialog" title={props.title}>
      {props.dot && <i className="rm-dot" aria-hidden />}
      <span>{props.children}</span>
    </button>
  );
}
