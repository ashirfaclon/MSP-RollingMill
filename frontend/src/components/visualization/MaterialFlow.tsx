/**
 * Material flow — billets fed to warehouse, with every loss peeling off at the stage it
 * leaves the line. Reads a resolved `MillFlow` (see models/millFlow.ts): cohort figures,
 * so the terminal buckets add back up to what was fed.
 */
import { Fragment, type ReactNode } from 'react';
import Panel from '@/components/Panel';
import FlowArrow from './FlowArrow';
import StackBar from './StackBar';
import LegendItem from './Legend';
import type { Series } from './KpiCard';
import { fixed } from '@/lib/num';
import { pctOfFed, type MillFlow, type Qty, type ReasonQty } from '@/models/millFlow';
import './materialflow.css';

const mt = (q: Qty) => (q.mt === null ? 'NA' : `${fixed(q.mt, 1)} MT`);
const countText = (q: Qty) => {
  if (q.count === null) return null;
  const unit = q.countUnit === 'bundle' ? 'bundle' : 'billet';
  return `${q.count.toLocaleString('en-IN')} ${unit}${q.count === 1 ? '' : 's'}`;
};
const pct = (v: number | null, dp = 1) => (v === null ? 'NA' : `${fixed(v, dp)}%`);

export default function MaterialFlow({ flow }: { flow: MillFlow }) {
  const ofFed = (q: Qty) => pctOfFed(flow, q.mt);
  const { qc, accepted } = flow;

  /* The whole cohort, terminal bucket by terminal bucket: good → pending → lost. */
  const buckets: { label: string; qty: Qty; series: Series }[] = [
    { label: 'Warehouse · with order', qty: accepted.withOrder, series: 'order' },
    { label: 'Warehouse · free stock', qty: accepted.free, series: 'free' },
    { label: 'On hold', qty: qc.onHold, series: 'hold' },
    { label: 'QC rejected', qty: qc.rejected, series: 'reject' },
    { label: 'Inline reject', qty: flow.inlineReject, series: 'inline' },
    { label: 'Process loss', qty: flow.processLoss, series: 'loss' },
  ];

  const failed = flow.checks.filter((c) => c.ok === false);
  const ratio = (a: number | null, b: number | null) => (a === null || !b ? null : (a / b) * 100);

  return (
    <Panel
      title="Material flow"
      sub="Billets fed in the window, followed to their status now"
      right={<BalanceChip flow={flow} />}
      className="rm-panel"
      bodyClass="rm-body mf-body"
    >
      <ol className="mf-flow" aria-label="Material flow, billets fed to warehouse">
        <Step
          node={<Node title="Billets fed" qty={flow.fed} series="prod" note="Charged to furnace" />}
          exits={[
            <Exit key="inline" title="Inline reject" qty={flow.inlineReject} series="inline"
              pct={ofFed(flow.inlineReject)} reasons={flow.inlineReject.reasons} />,
          ]}
        />
        <Arrow />
        <Step
          node={<Node title="Rolled" qty={flow.rolled} series="prod" pct={ofFed(flow.rolled)} />}
          exits={[
            <Exit key="loss" title="Process loss" qty={flow.processLoss} series="loss"
              pct={ofFed(flow.processLoss)} note="Scale · crop ends · un-weighed scrap" />,
          ]}
        />
        <Arrow />
        <Step
          node={<Node title="Production output" qty={flow.output} series="prod" pct={ofFed(flow.output)}
            note={`${mt(flow.output.withOrder)} with order`} />}
          exits={[
            <Exit key="rej" title="QC rejected" qty={qc.rejected} series="reject"
              pct={ofFed(qc.rejected)} note="To remelt · re-produced later" />,
            <Exit key="hold" title="On hold" qty={qc.onHold} series="hold"
              pct={ofFed(qc.onHold)} note="Pending QC · accepted or rejected" />,
          ]}
        />
        <Arrow />
        <Step node={<Node title="QC accepted" qty={qc.accepted} series="ok" pct={ofFed(qc.accepted)} />} />
        <Arrow />
        <li className="mf-step mf-ends">
          {/* Both kinds wait in the warehouse (QC, cooling); dispatch is a stock movement later. */}
          <Node title="Warehouse · with order" qty={accepted.withOrder} series="order" pct={ofFed(accepted.withOrder)}
            note="Marked for its order" compact />
          <Node title="Warehouse · free" qty={accepted.free} series="free" pct={ofFed(accepted.free)}
            note="Free stock · no order" compact />
        </li>
      </ol>

      {failed.length > 0 && (
        <ul className="mf-alert" role="alert">
          {failed.map((c) => (
            <li key={c.id}>
              <b>{c.label}</b> — off by {c.gap === null ? 'NA' : `${fixed(Math.abs(c.gap), 1)} MT`}
            </li>
          ))}
        </ul>
      )}

      <section className="mf-split" aria-label="Where the billets went">
        <div className="rm-alloc-head">
          <span className="rm-k">Where the billets went</span>
          <span className="mf-split-total num v-val">{mt(flow.fed)} fed</span>
        </div>
        <StackBar
          label={`Of ${mt(flow.fed)} fed: ${buckets.map((b) => `${b.label} ${mt(b.qty)}`).join(', ')}`}
          max={flow.fed.mt ?? undefined}
          parts={buckets.map((b) => ({ label: b.label, value: b.qty.mt ?? 0, series: b.series }))}
        />
        <div className="rm-legend mf-legend">
          {buckets.map((b) => (
            <LegendItem key={b.label} series={b.series} label={b.label}
              value={`${mt(b.qty)} · ${pct(ofFed(b.qty))}`} />
          ))}
        </div>
      </section>

      <dl className="rm-ops mf-kpis">
        <div><dt>Mass yield</dt><dd className="num">{pct(ofFed(flow.output))}</dd></div>
        <div><dt>Prime yield</dt><dd className="num">{pct(ofFed(qc.accepted))}</dd></div>
        <div><dt>Inline reject</dt><dd className="num">{pct(ofFed(flow.inlineReject))}</dd></div>
        <div><dt>QC reject</dt><dd className="num">{pct(ratio(qc.rejected.mt, flow.output.mt))} of output</dd></div>
        <div><dt>On hold</dt><dd className="num">{pct(ratio(qc.onHold.mt, flow.output.mt))} of output</dd></div>
      </dl>
    </Panel>
  );
}

function BalanceChip({ flow }: { flow: MillFlow }) {
  const title = flow.checks
    .map((c) => `${c.ok === null ? '–' : c.ok ? '✓' : '✗'} ${c.label}`)
    .join('\n');
  if (flow.balanced === true) return <span className="chip chip--ok" title={title}>Balance closes</span>;
  if (flow.balanced === false) return <span className="chip chip--risk" title={title}>Balance off</span>;
  return <span className="chip chip--na" title={title}>Balance incomplete</span>;
}

function Step({ node, exits = [] }: { node: ReactNode; exits?: ReactNode[] }) {
  return (
    <li className="mf-step">
      {node}
      {exits.length > 0 && <div className="mf-exits">{exits.map((e, i) => <Fragment key={i}>{e}</Fragment>)}</div>}
    </li>
  );
}

function Arrow() {
  return <li className="mf-arrow" aria-hidden><FlowArrow /></li>;
}

function Node(props: {
  title: string; qty: Qty; series: Series;
  /** Share of fed; omitted on the fed node itself, where it is always 100%. */
  pct?: number | null; note?: string; compact?: boolean;
}) {
  const count = countText(props.qty);
  const share = props.pct === undefined ? null : `${pct(props.pct)} of fed`;
  return (
    <div className={`mf-node rm-tone--${props.series}${props.compact ? ' mf-node--compact' : ''}`}
      role="group" aria-label={props.title}>
      <span className="mf-node-title">{props.title}</span>
      <span className="mf-node-value num v-val">{mt(props.qty)}</span>
      <span className="mf-node-meta">
        {[count, props.note, share].filter(Boolean).join(' · ')}
      </span>
    </div>
  );
}

function Exit(props: {
  title: string; qty: Qty; series: Series; pct: number | null; note?: string; reasons?: ReasonQty[];
}) {
  const count = countText(props.qty);
  return (
    <div className={`mf-exit rm-tone--${props.series}`} role="group" aria-label={props.title}>
      <span className="mf-exit-head">
        <span className="mf-exit-title">{props.title}</span>
        <span className="mf-exit-value num">{mt(props.qty)}</span>
      </span>
      <span className="mf-node-meta">
        {[count, `${pct(props.pct)} of fed`].filter(Boolean).join(' · ')}
      </span>
      {props.note && <span className="mf-exit-note">{props.note}</span>}
      {props.reasons && props.reasons.length > 0 && (
        <ul className="mf-reasons">
          {props.reasons.map((r) => (
            <li key={r.code}>
              <span>{r.label}</span>
              <b className="num">{[countText(r.qty), mt(r.qty)].filter(Boolean).join(' · ')}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
