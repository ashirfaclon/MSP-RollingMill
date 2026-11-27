'use client';

/**
 * Billets in against strip out, and where the difference went — the ERP Production Log
 * Sheet for the Duration filter's period, drawn as a mass balance:
 *
 *   input bar    [ finished ──────────────────────────────── | difference ]
 *   loss bar     [ burning loss | end cut | miss-roll | reject            ]
 *
 * Each loss is 1–5 % of the input — a sliver on the input bar — so the difference is
 * opened out into its own full-width bar, where the biggest loss stands out at a glance.
 * Both bars keep true proportions. The whole balance is ONE click: it opens the material
 * balance drawer (the same split per day / week / month). The figures inside are not
 * separate doors — yield and billets have their own drawers from the Mass yield card and
 * the mill flow.
 *
 * Follows the Rolling switch: Online (ST001), Offline (ST002) or both (performance.xlsx, the user, 25 Nov 2026).
 * Under it, the operating figures, each opening its own drill-down: defective (ROLLING_DEFECT_MT, the user)
 * and — under Online and Both only, as the plant's sheet marks them ONLINE (the user, 25 Nov 2026) — CCM bypass
 * and HSM bypass. Breakdown hours are a card of their own in the strip, as on LSM.
 */
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import Panel from '@/components/Panel';
import { fixed } from '@/lib/num';
import BalanceDrawer from '@/components/drill/BalanceDrawer';
import BalanceStats from '@/components/production/BalanceStats';
import LogMetricDrawer, { LOG_METRICS, shareOf, type LogMetric } from '@/components/drill/LogMetricDrawer';
import { RMD_MODE_LABELS, useGlobalSel } from '@/state/globalSel';
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

/** The panel's operating figures; the two bypasses are Online's (not shown under Offline). Breakdown is a card. */
const OPS: LogMetric[] = ['rollingDefectMt', 'ccmBypassMt', 'hsmBypassMt'];

/** Smallest remainder worth drawing — the ERP's own rounding. */
const MIN_MT = 0.05;

const pct = (v: number | null | undefined, of: number | null | undefined) =>
  v === null || v === undefined || !of ? 0 : (v / of) * 100;
const mt = (v: number | null | undefined) => `${fixed(v, 1)} MT`;

export default function MaterialBalance() {
  const { current, loading, note } = useErpPeriod();
  const [open, setOpen] = useState(false);
  const [metric, setMetric] = useState<LogMetric | null>(null);
  const mode = useGlobalSel().rmdMode;
  const openOnKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } };
  const t = current?.totals;
  const has = !!t?.entryDays;

  // Input bar: finished | difference, as shares of the input.
  const finishedPct = has ? pct(t!.productionMt, t!.inputMt) : 0;
  const diffPct = has ? pct(t!.massDiffMt, t!.inputMt) : 0;

  // Loss bar: the difference opened out. Scaled to whichever is larger, the four losses
  // or the difference, so a day where they don't add up shows the gap instead of hiding it.
  // A loss that is 0 for the period isn't there: no segment, no legend entry.
  const losses = LOSSES.map((l) => ({ ...l, value: has ? (t![l.key] as number | null) ?? 0 : 0 }))
    .filter((l) => !has || l.value >= MIN_MT);
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
    <Panel title="Material & operating balance" sub={mode === 'all' ? undefined : `${RMD_MODE_LABELS[mode]} rolling`} className="rm-panel" bodyClass="rm-body">
      <div
        className="rm-mb rm-mb--button"
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-label="Material balance, per day"
        title="Billet input, finished and losses, per day"
        onClick={() => setOpen(true)}
        onKeyDown={openOnKey}
      >
        {/* Input: billets in, and the yield they gave. */}
        <div className="rm-mb-head">
          <Figure label="Billet input" value={has ? mt(t!.inputMt) : 'NA'} loading={loading} />
          <Figure label="Yield" value={has ? `${fixed(t!.yieldPct, 1)}%` : 'NA'} loading={loading} tone="order" align="end" />
        </div>
        <span className="rm-mb-bar rm-mb-bar--input" role="img" aria-label={inputLabel}>
          <i className="rm-mb-seg rm-tone--order" style={{ width: `${finishedPct}%` }} title={has ? `Finished ${mt(t!.productionMt)}` : undefined} />
          <i className="rm-mb-seg rm-tone--diff" style={{ width: `${diffPct}%` }} title={has ? `Mass difference ${mt(t!.massDiffMt)}` : undefined} />
        </span>
        <div className="rm-mb-labels">
          <Link tone="order">
            Finished <b className="num">{has ? mt(t!.productionMt) : 'NA'}</b>
          </Link>
          <Link tone="diff">
            Mass difference <b className="num">{has ? mt(t!.massDiffMt) : 'NA'}</b>
            {has && <>{' '}<span className="rm-mb-dim num">· {fixed(diffPct, 1)}% of input</span></>}
          </Link>
        </div>

        {/* The difference, opened out to full width. */}
        <div className="rm-mb-losses">
        <span className="rm-mb-bar rm-mb-bar--loss" role="img" aria-label={lossLabel}>
          {losses.map((l) => (
            <i key={l.key} className={`rm-mb-seg rm-tone--${l.series}`} style={{ width: `${pct(l.value, lossScale)}%` }} title={`${l.label} ${mt(l.value)}`} />
          ))}
          {unaccounted > MIN_MT && (
            <i className="rm-mb-seg rm-mb-seg--gap rm-tone--loss" style={{ width: `${pct(unaccounted, lossScale)}%` }} title={`Unaccounted ${mt(unaccounted)}`} />
          )}
        </span>
        <div className="rm-mb-legend">
          {losses.map((l) => (
            <Link key={l.key} tone={l.series} dot title={l.hint}>
              {l.label} <b className="num">{has ? mt(l.value) : 'NA'}</b>
              {has && <>{' '}<span className="rm-mb-dim num">{fixed(pct(l.value, t!.inputMt), 1)}%</span></>}
            </Link>
          ))}
          {unaccounted > MIN_MT && (
            <Link tone="loss" dot title="Difference the four losses do not explain">
              Unaccounted <b className="num">{mt(unaccounted)}</b>
            </Link>
          )}
        </div>
        </div>
        {!has && !loading && <p className="rm-mb-note">{note}</p>}

      </div>

      {/* Billets and coils, then the operating figures — each opens its drill-down (performance.xlsx, the user, 25 Nov 2026). */}
      <BalanceStats items={[
        { key: 'in', label: 'Billets in', value: has ? t!.inputPcs : null, unit: 'pcs', whole: true, loading, onOpen: () => setOpen(true), title: 'Material balance per day' },
        { key: 'out', label: 'Coils out', value: has ? t!.productionPcs : null, unit: 'pcs', whole: true, loading, onOpen: () => setOpen(true), title: 'Material balance per day' },
        ...OPS.filter((k) => mode !== 'offline' || k === 'rollingDefectMt').map((k) => ({
          key: k, label: LOG_METRICS[k].name, value: has ? (t![k] as number | null) : null, unit: LOG_METRICS[k].unit, loading,
          // Defective with its % of production beside it (the user, 27 Nov 2026).
          pct: has && LOG_METRICS[k].pct ? shareOf(t!, k) : null,
          onOpen: () => setMetric(k), title: `${LOG_METRICS[k].name} per day`,
        })),
      ]} />

      <BalanceDrawer open={open} onClose={() => setOpen(false)} />
      <LogMetricDrawer metric={metric} onClose={() => setMetric(null)} />
    </Panel>
  );
}

/** A headline figure. */
function Figure(props: { label: string; value: string; loading: boolean; tone?: Series; align?: 'end' }) {
  return (
    <span className={`rm-mb-figure${props.tone ? ` rm-tone--${props.tone}` : ''}${props.align ? ' rm-mb-figure--end' : ''}`}>
      <span className="rm-k">{props.label}</span>
      {props.loading ? <span className="skel skel--num" role="status" aria-label="Loading" /> : <span className="rm-mb-figure-v num">{props.value}</span>}
    </span>
  );
}

/** A bar's caption or a legend entry, coloured like its segment. */
function Link(props: { tone: Series; dot?: boolean; title?: string; children: ReactNode }) {
  return (
    <span className={`rm-mb-link rm-tone--${props.tone}`} title={props.title}>
      {props.dot && <i className="rm-dot" aria-hidden />}
      <span>{props.children}</span>
    </span>
  );
}

