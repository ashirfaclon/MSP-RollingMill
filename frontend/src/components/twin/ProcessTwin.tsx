'use client';

/**
 * The process twin — one drawing for both mills (process-twin-guide §6, improvement-spec C1,
 * C4–C8): the model's ROWS of machines, each row its sections, the billet infeed at the left
 * feeding every row and the exit at the right collecting them, the pass line one straight
 * line through every machine.
 *
 * WHAT MOVES IS MEASURED. A run moves only when it is on the ACTIVE PATH — open edges
 * reachable from the infeed through machines that report running — at the measured speed of
 * the machine feeding it; an idle branch recedes; a running machine the path never reaches
 * is drawn as it is — running, with the runs into it idle — not explained away (no banner text:
 * the user, 30 Oct 2026).
 *
 * LANES (spec C5), fixed heights, nothing shares one:
 *   header 14 → name 14 → machine band → reading 16 → ref bar 6 → row meta 12
 * and a gap of at least 18 between a row's meta and the next row's header.
 *
 * LAYOUT IS ARITHMETIC OVER THE MODEL. Every machine is drawn at ONE scale (px per metre),
 * chosen so the longest row fits the width, standing on its row's floor by its base point —
 * so a one-stand row or a two-line mill draws from the same code, and the pass line never steps.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { ageOf, good, periodLabel, readingText } from './signal';
import { EXIT, INFEED, litSet, type TwinModel, type TwinNode, type TwinRow } from './twinModel';
import { Sprite } from './twinArt';
import { Lamp, Readout, RefBar, Run, SelectRing, TwinDefs, flowOf, nozzle, spriteBox, spriteMetres, type Box, type RunState } from './twinDraw';
import { BILLETS, CURRENT } from './twinSignals';
import './twin.css';

/* ------------------------------- geometry -------------------------------- */

const VB_W = 1151;
const PAD = 16;
/** Lanes, px. */
const LANE = { header: 14, name: 14, reading: 16, bar: 6, meta: 12, rowGap: 18 };
/** Between machines, and between a row's sections. */
const GAP = { machine: 8, section: 30, endRun: 24 };
/** A header's width: the .mx-group face is ~6.1 px a character at 9.5 px plus 1.2 px tracking. */
const captionW = (t: string) => t.length * 7.3;
/** A machine name's width (.mx-name, 11 px bold). */
const nameW = (t: string) => t.length * 6.8;
/** The machine band is sized to the tallest machine at this scale; never more than this (px per metre). */
const MAX_PX_PER_M = 14;
/** The infeed table and the exit at the ends, at the same scale. */
const END = { infeed: 'table', hsm: 'coil', rmd: 'bundle' } as const;
/** An end column is never narrower than its labels ("SINCE 29 OCT 09:00 IST"), whatever the scale. */
const END_MIN_W = 132;

interface Placed { node: TwinNode; box: Box; sprite: string }
interface RowPlan {
  row: TwinRow; top: number; floor: number;
  sections: { id: string; label: string; x0: number; x1: number; on: number; total: number }[];
  machines: Placed[];
}
interface Layout { h: number; pxPerM: number; rows: RowPlan[]; infeed: Box; exit: Box; forkX: number; mergeX: number }

const spriteOf = (n: TwinNode) => (n.state === 'running' || n.state === 'warning' ? `${n.kind}-hot` : n.kind);

function layout(m: TwinModel): Layout {
  const infeedM = spriteMetres(END.infeed);
  const exitM = spriteMetres(END[m.mill]);
  const rows = m.rows.filter((r) => r.sections.some((s) => s.nodeIds.length));
  /* The scale: the longest row's machines, end to end, must fit between the infeed and the exit. */
  const rowMetres = (r: TwinRow) => r.sections.flatMap((s) => s.nodeIds).reduce((a, id) => a + spriteMetres(spriteOf(m.route.nodes[id])).w, 0);
  const caption = (r: TwinRow, s: TwinRow['sections'][number]) => `${r.label ? `${r.label} · ` : ''}${s.label} · ${s.on} of ${s.total} on`;
  /* The gap after a section: the usual one, or more where two short sections would otherwise
     overlap their centred headers (spec C5: no two labels may touch). */
  const sectionGap = (r: TwinRow, i: number, pxPerM: number) => {
    const a = r.sections[i]; const b = r.sections[i + 1];
    if (!b) return 0;
    const span = (s: TwinRow['sections'][number]) => s.nodeIds.reduce((w, id) => w + spriteMetres(spriteOf(m.route.nodes[id])).w * pxPerM, 0) + machineGaps(s, pxPerM);
    const need = (captionW(caption(r, a)) + captionW(caption(r, b))) / 2 + 10 - (span(a) + span(b)) / 2;
    return Math.max(GAP.section, need);
  };
  /* The gap after a machine: the usual one, or more where two narrow machines would otherwise
     overlap their centred names. */
  const machineGap = (a: TwinNode, b: TwinNode | undefined, pxPerM: number) => {
    if (!b) return 0;
    const wa = spriteMetres(spriteOf(a)).w * pxPerM; const wb = spriteMetres(spriteOf(b)).w * pxPerM;
    return Math.max(GAP.machine, (nameW(a.name) + nameW(b.name)) / 2 + 6 - (wa + wb) / 2);
  };
  const machineGaps = (s: TwinRow['sections'][number], pxPerM: number) =>
    s.nodeIds.reduce((g, id, j) => g + machineGap(m.route.nodes[id], m.route.nodes[s.nodeIds[j + 1]], pxPerM), 0);
  const rowGaps = (r: TwinRow, pxPerM = MAX_PX_PER_M) =>
    r.sections.reduce((a, s, i) => a + machineGaps(s, pxPerM) + sectionGap(r, i, pxPerM), 0);
  const widest = rows.reduce((a, r) => Math.max(a, rowMetres(r) + rowGaps(r) / MAX_PX_PER_M), 0);
  const fixedPx = PAD * 2 + GAP.endRun * 2;
  const pxPerM = rows.length ? Math.min(MAX_PX_PER_M, (VB_W - fixedPx - END_MIN_W * 2 - Math.max(...rows.map(rowGaps))) / widest) : MAX_PX_PER_M;
  const tallest = rows.length
    ? Math.max(...rows.flatMap((r) => r.sections.flatMap((s) => s.nodeIds.map((id) => spriteMetres(spriteOf(m.route.nodes[id])).h)))) * pxPerM
    : 60;
  const band = Math.max(tallest, infeedM.h * pxPerM, exitM.h * pxPerM);
  const rowH = LANE.header + LANE.name + band + LANE.reading + LANE.bar + LANE.meta;

  const infeedW = Math.max(END_MIN_W, infeedM.w * pxPerM);
  const exitW = Math.max(END_MIN_W, exitM.w * pxPerM);
  const x0 = PAD + infeedW + GAP.endRun;
  const x1 = VB_W - PAD - exitW - GAP.endRun;
  const plans: RowPlan[] = rows.map((r, i) => {
    const top = PAD / 2 + i * (rowH + LANE.rowGap);
    const floor = top + LANE.header + LANE.name + band;
    const used = rowMetres(r) * pxPerM + rowGaps(r, pxPerM);
    let x = x0 + Math.max(0, (x1 - x0 - used) / 2);
    const machines: Placed[] = [];
    const sections: RowPlan['sections'] = [];
    r.sections.forEach((s, si) => {
      const sx0 = x;
      s.nodeIds.forEach((id, j) => {
        const node = m.route.nodes[id];
        const sprite = spriteOf(node);
        const w = spriteMetres(sprite).w * pxPerM;
        machines.push({ node, sprite, box: spriteBox(sprite, x + w / 2, floor, pxPerM) });
        x += w + machineGap(node, m.route.nodes[s.nodeIds[j + 1]], pxPerM);
      });
      sections.push({ id: s.id, label: s.label, x0: sx0, x1: x, on: s.on, total: s.total });
      x += sectionGap(r, si, pxPerM);
    });
    return { row: r, top, floor, sections, machines };
  });
  const h = plans.length ? plans[plans.length - 1].top + rowH + PAD / 2 : rowH + PAD;
  /* The ends stand on the middle row's floor (one row: the same floor, one straight line). */
  const midFloor = plans.length ? (plans[0].floor + plans[plans.length - 1].floor) / 2 : h / 2;
  const infeed = spriteBox(END.infeed, PAD + infeedW / 2, midFloor, pxPerM);
  const exit = spriteBox(END[m.mill], VB_W - PAD - exitW / 2, midFloor, pxPerM);
  return { h, pxPerM, rows: plans, infeed, exit, forkX: x0 - GAP.endRun / 2, mergeX: x1 + GAP.endRun / 2 };
}

/** Straight where both ends share a height; a jog where they do not (the fork and the merge). */
const runPath = ([x1, y1]: [number, number], [x2, y2]: [number, number], viaX?: number) =>
  (Math.abs(y1 - y2) < 0.75 ? `M${x1} ${y1} H${x2}` : `M${x1} ${y1} H${viaX ?? (x1 + x2) / 2} V${y2} H${x2}`);

export type TwinTarget = { kind: 'infeed' } | { kind: 'exit' } | { kind: 'node'; node: TwinNode };

/** The aria summary of the whole drawing (spec §7), refreshed at most every 10 s by the host. */
export function twinSummary(m: TwinModel): string {
  const parts = m.rows.map((r) => `${r.label ? `${r.label}: ` : ''}${r.sections.map((s) => `${s.label} ${s.on} of ${s.total} running`).join(', ')}`);
  const issues = [m.issues.stale.length ? `${m.issues.stale.length} signals stale` : '', m.issues.suspect.length ? `${m.issues.suspect.length} doubtful` : ''].filter(Boolean);
  return `${m.mill.toUpperCase()} mill: ${parts.join('; ')}${issues.length ? `; ${issues.join(', ')}` : ''}${m.orphans.length ? '; route inconsistent' : ''}.`;
}

export default function ProcessTwin({ model, onOpen, selected, onSelect }: {
  model: TwinModel;
  onOpen: (t: TwinTarget) => void;
  /** The selected machine's id (owned by the host so the drill-down can key off it). */
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const L = useMemo(() => layout(model), [model]);
  const [hover, setHover] = useState<string | null>(null);
  const sel = selected ?? hover;
  const lit = useMemo(() => litSet(model.route, sel), [model.route, sel]);
  const isOn = (k: string) => lit === null || lit.has(k);
  const cls = (k: string) => `mx-node${lit === null ? '' : isOn(k) ? ' is-on' : ' is-off'}`;

  /* The summary changes at most every 10 s, so a screen reader is not read a new sentence on every poll. */
  const [summary, setSummary] = useState(() => twinSummary(model));
  const summaryAt = useRef(0);
  useEffect(() => {
    const next = twinSummary(model);
    if (next === summary) return;
    const wait = Math.max(0, summaryAt.current + 10_000 - Date.now());
    const id = setTimeout(() => { summaryAt.current = Date.now(); setSummary(next); }, wait);
    return () => clearTimeout(id);
  }, [model, summary]);

  useEffect(() => {
    if (selected === null) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onSelect(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, onSelect]);

  const pick = (k: string, open: () => void, label: string) => ({
    role: 'button' as const, tabIndex: 0, 'aria-haspopup': 'dialog' as const, 'aria-label': label,
    onMouseEnter: () => setHover(k), onMouseLeave: () => setHover(null), onFocus: () => setHover(k), onBlur: () => setHover(null),
    onClick: (e: MouseEvent) => { e.stopPropagation(); onSelect(k); open(); },
    onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(k); open(); } },
  });
  const say = (n: TwinNode) => {
    const r = readingText(n.current, CURRENT, model.now);
    const state = n.state === 'running' ? 'running' : n.state === 'stopped' ? 'stopped' : n.state === 'fault' ? 'stopped while its section runs' : n.state === 'warning' ? 'warning' : 'no live data';
    return `${n.name} ${state}${n.current.quality === 'missing' ? '' : `, ${r.text} amps${n.current.quality === 'stale' ? ' (stale)' : n.current.quality === 'suspect' ? ' (doubtful)' : ''}`}`;
  };

  const placed = useMemo(() => new Map(L.rows.flatMap((r) => r.machines.map((p) => [p.node.id, p] as const))), [L]);
  const io = (p: Placed): [[number, number], [number, number]] => [nozzle(p.box, p.sprite, 'in'), nozzle(p.box, p.sprite, 'out')];
  const infeedOut = nozzle(L.infeed, END.infeed, 'out');
  const exitIn = nozzle(L.exit, END[model.mill], 'in');
  const runState = (id: string): RunState => (model.active.has(id) ? 'active' : 'idle');

  /* Each edge of the route, drawn between the real nozzles of what it joins. */
  const runs = model.route.edges.map((e) => {
    const from = e.from === INFEED ? infeedOut : placed.get(e.from) && io(placed.get(e.from)!)[1];
    const to = e.to === EXIT ? exitIn : placed.get(e.to) && io(placed.get(e.to)!)[0];
    if (!from || !to) return null;
    const row = e.from === INFEED ? model.rows.find((r) => r.sections[0]?.nodeIds[0] === e.to) : null;
    const speed = e.from === INFEED ? row?.speedNorm ?? model.infeed.speedNorm : model.route.nodes[e.from]?.speed ?? null;
    const load = e.from === INFEED ? null : model.route.nodes[e.from]?.load;
    const via = e.from === INFEED ? L.forkX : e.to === EXIT ? L.mergeX : undefined;
    return <Run key={e.id} k={e.id} on={isOn(e.id)} state={runState(e.id)} d={runPath(from, to, via)} flow={flowOf(speed, load ?? speed)} />;
  });


  return (
    <div className={`mx-host${sel !== null ? ' is-sel' : ''}`} style={{ aspectRatio: VB_W / L.h }}
      onClick={() => onSelect(null)} tabIndex={-1}>
      <svg className="mx" viewBox={`0 0 ${VB_W} ${L.h}`} role="img" aria-label={summary}>
        <TwinDefs />
        {runs}

        {/* ------------------------------ billet infeed ------------------------ */}
        {(() => {
          const b = L.infeed;
          const readY = b.y + b.h + LANE.reading - 4;
          const anyOn = model.totals.on > 0;
          return (
            <g className={cls(INFEED)} {...pick(INFEED, () => onOpen({ kind: 'infeed' }), `Billet infeed, ${readingText(model.infeed.billets, BILLETS, model.now).text} billets`)}>
              <Sprite name={END.infeed} b={b} dim={!anyOn} />
              <text className="mx-name" x={b.cx} y={b.y - 5} textAnchor="middle">Billet infeed</text>
              <Readout cx={b.cx} y={readY} signal={model.infeed.billets} spec={BILLETS} now={model.now} unit="billets" accumulated />
              <text className="mx-sub" x={b.cx} y={readY + LANE.meta} textAnchor="middle">{periodLabel(model.infeed.period, model.now)}</text>
              {model.infeed.speed && (
                <text className="mx-sub" x={b.cx} y={readY + LANE.meta * 2} textAnchor="middle">
                  MILL SPEED {good(model.infeed.speed.signal) === null ? (model.infeed.speed.signal.quality === 'missing' ? 'NA' : readingText(model.infeed.speed.signal, model.infeed.speed.spec, model.now, 2).text.toUpperCase()) : model.infeed.speed.signal.value!.toFixed(2)}
                </text>
              )}
              {selected === INFEED && <SelectRing b={b} />}
            </g>
          );
        })()}

        {/* --------------------------------- the rows -------------------------- */}
        {L.rows.map((rp) => (
          <g key={rp.row.id}>
            {/* One header per section of THIS row, counting only this row (spec C5). */}
            {rp.sections.map((s) => (
              <g key={s.id}>
                <text className="mx-group" x={(s.x0 + s.x1) / 2} y={rp.top + 11} textAnchor="middle">
                  {rp.row.label ? `${rp.row.label} · ` : ''}{s.label} · {s.on} of {s.total} on
                </text>
                <path className="mx-group-line" d={`M${s.x0} ${rp.top + LANE.header} H${s.x1}`} />
              </g>
            ))}
            {/* The row's own speed, in its meta lane at the left of the row. */}
            {rp.row.speed && rp.sections[0] && (() => {
              const r = readingText(rp.row.speed.signal, rp.row.speed.spec, model.now, rp.row.speed.dp);
              return (
                <text className={`mx-sub${r.quality === 'suspect' ? ' mx-read--suspect' : ''}`} x={rp.sections[0].x0 - 10} y={rp.top + 11} textAnchor="end">
                  {rp.row.label.toUpperCase()} SPEED {r.text.toUpperCase()}{r.quality === 'missing' ? '' : ` ${rp.row.speed.unit.toUpperCase()}`}{r.suffix.toUpperCase()}
                </text>
              );
            })()}
            {rp.machines.map(({ node: n, box: b, sprite }) => {
              const readY = rp.floor + LANE.reading - 4;
              const stopped = n.state === 'stopped';
              return (
                <g key={n.id} className={cls(n.id)} {...pick(n.id, () => onOpen({ kind: 'node', node: n }), say(n))}>
                  <title>{say(n)}</title>
                  <Sprite name={sprite} b={b} fault={n.state === 'fault'} dim={n.state === 'stopped' || n.state === 'unknown'} />
                  <text className="mx-name" x={b.cx} y={b.y - 5} textAnchor="middle">{n.name}</text>
                  <Lamp x={b.x + b.w - 6} y={b.y + 6} state={n.state} label={say(n)} />
                  <Readout cx={b.cx} y={readY} signal={n.current} spec={CURRENT} now={model.now} unit="A" small
                    text={n.running.quality === 'missing' ? 'NA' : stopped || (n.state === 'fault' && n.running.value === false) ? 'Off' : undefined} />
                  <RefBar cx={b.cx} y={rp.floor + LANE.reading + 1} load={n.load} tone={n.tone} quality={n.current.quality} />
                  {(n.current.quality === 'stale' || n.running.quality === 'stale') && (
                    <text className="mx-sub mx-read--stale" x={b.cx} y={rp.floor + LANE.reading + LANE.bar + LANE.meta - 2} textAnchor="middle">
                      {ageOf(n.current.ts ?? n.running.ts, model.now).toUpperCase()} OLD
                    </text>
                  )}
                  {selected === n.id && <SelectRing b={b} />}
                </g>
              );
            })}
          </g>
        ))}

        {/* -------------------------------- finished exit ---------------------- */}
        {(() => {
          const b = L.exit;
          const readY = b.y + b.h + LANE.reading - 4;
          const mt = model.exit.mt;
          return (
            <g className={cls(EXIT)} {...pick(EXIT, () => onOpen({ kind: 'exit' }), `Finished exit, ${mt === null ? 'NA' : `${mt.toFixed(1)} tonnes`} for the period`)}>
              <Sprite name={END[model.mill]} b={b} />
              <text className="mx-name" x={b.cx} y={b.y - 5} textAnchor="middle">Finished exit</text>
              <Readout cx={b.cx} y={readY} signal={{ value: mt, ts: mt === null ? null : model.now, quality: mt === null ? 'missing' : 'good' }} spec={{ staleAfterMs: Infinity }} now={model.now} unit="MT" dp={1} accumulated />
              <text className="mx-sub" x={b.cx} y={readY + LANE.meta} textAnchor="middle">{model.exit.sub}</text>
              {selected === EXIT && <SelectRing b={b} />}
            </g>
          );
        })()}

      </svg>
      {selected !== null && (
        <button type="button" className="mx-clear" onClick={(e) => { e.stopPropagation(); onSelect(null); }}>Clear selection</button>
      )}
    </div>
  );
}
