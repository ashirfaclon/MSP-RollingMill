/**
 * The mills as data — the process twins' model (process-twin-guide §3, mill-mimic-improvement-spec).
 *
 * No geometry, no colours. One model shape for both mills: ROWS of machines (HSM one row, RMD a
 * row per line), each machine a NODE with its readings as quality-judged signals, and the
 * ROUTE between them as a graph of edges from the infeed to the exit — so the drawing lights
 * the path steel is actually taking, and says so when a running machine has no feed path.
 *
 * Principles kept (spec §1): what moves is measured; `null` never becomes 0 — unknown, stale
 * and zero are three facts; ids are the plant's (the historian's RM_01 … L2_Tail_Breaker_02);
 * speeds and loads are normalised 0..1 here, never in the drawing; nothing is drawn that the
 * mill mimic has no tag for (the user, 29 Oct 2026).
 */
import type { HsmLive, RmdLive, RmdMillSpeedReport } from '@/services/hsmApi';
import { assess, assessFlag, good, runningOf, type Period, type Signal } from './signal';
import { BAR_RISK, BAR_WARN, BILLETS, CURRENT, FORCE_T, HSM_MILL_SPEED, LINE_MPS, RPM, RUNNING, ratingOf, type SignalSpec } from './twinSignals';

export type TwinMill = 'hsm' | 'rmd';
export type TwinMachine = 'stand' | 'pinch' | 'tb' | 'shear';
export type TwinTone = 'ok' | 'warn' | 'risk' | 'na';
/** The lamp's state — each has its own shape, so state never rests on colour alone (spec C8). */
export type LampState = 'running' | 'stopped' | 'warning' | 'fault' | 'unknown';

export const INFEED = 'infeed';
export const EXIT = 'exit';
export const runKey = (a: string, b: string) => `r:${a}>${b}`;

export interface TwinNode {
  id: string;
  /** As the plant says it: RM1, FM6, S3, PR pre. */
  name: string;
  kind: TwinMachine;
  /** Which row and section of the drawing it belongs to. */
  row: string;
  section: string;
  running: Signal<boolean>;
  current: Signal;
  rpm: Signal | null;
  forceT: Signal | null;
  /** Rated current from the plant config; null = not given. */
  ratedA: number | null;
  /** What the reference bar compares against: the rating, else the section's highest good current now. */
  refA: number | null;
  refKind: 'rated' | 'section-max' | null;
  /** 0..1 — current ÷ refA, only from a good reading; null otherwise. */
  load: number | null;
  /** 0..1 — the speed of the run leaving this node (HSM: its RPM ÷ the section's highest; RMD: its line's m/s); null = not moving / unknown. */
  speed: number | null;
  state: LampState;
  tone: TwinTone;
  /** Ids of the edges leaving this node. */
  lines: string[];
}

export interface TwinEdge {
  id: string;
  from: string;
  to: string;
  /** Only crosses a diverter when the plant gives one; none mapped yet (29 Oct 2026). */
  via?: { diverterId: string; position: string };
}

export interface TwinDiverter { id: string; positions: string[]; position: Signal<string> }

export interface TwinRoute {
  nodes: Record<string, TwinNode>;
  edges: TwinEdge[];
  diverters: Record<string, TwinDiverter>;
}

export interface TwinSection {
  id: string;
  label: string;
  nodeIds: string[];
  /** Running for sure / all. */
  on: number;
  total: number;
}

export interface TwinRow {
  id: string;
  /** "Line 1"; empty for a single-row mill. */
  label: string;
  sections: TwinSection[];
  /** The row's own speed signal and how to say it (RMD: its line's m/s). null = none measured per row. */
  speed: { signal: Signal; spec: SignalSpec; unit: string; dp: number } | null;
  /** 0..1 for the run from the infeed into the row's first machine; null = unknown. */
  speedNorm: number | null;
}

export interface TwinModel {
  mill: TwinMill;
  /** False for a fixture. */
  live: boolean;
  /** The clock every quality was judged against. */
  now: number;
  infeed: {
    billets: Signal;
    period: Period | null;
    /** HSM: the roughing mill speed (normalised feedback). Shown beside the infeed. */
    speed: { signal: Signal; spec: SignalSpec; unit: string; dp: number } | null;
    speedNorm: number | null;
  };
  exit: { mt: number | null; sub: string };
  rows: TwinRow[];
  route: TwinRoute;
  /** Edge ids carrying steel now: open edges reachable from the infeed through running nodes. */
  active: Set<string>;
  /** Running nodes the active path never reached — the drawing's amber banner. */
  orphans: string[];
  /** For the live pill: what is not good right now. */
  issues: { stale: string[]; suspect: string[] };
  /** Plant-wide: machines running for sure / all. */
  totals: { on: number; total: number };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null);
const MISSING_FLAG: Signal<boolean> = { value: null, ts: null, quality: 'missing' };

/* ------------------------------- the route -------------------------------- */

/** An edge is open if it has no diverter, or its diverter is fresh and in that position. */
export const isOpen = (e: TwinEdge, r: TwinRoute) =>
  !e.via || (r.diverters[e.via.diverterId]?.position.quality === 'good' && r.diverters[e.via.diverterId].position.value === e.via.position);

/** Active path = open edges reachable from the infeed that pass only through running nodes. */
export function activeEdges(r: TwinRoute): Set<string> {
  const out = new Set<string>();
  const queue = [INFEED];
  const seen = new Set(queue);
  while (queue.length) {
    const at = queue.shift()!;
    for (const e of r.edges) {
      if (e.from !== at || !isOpen(e, r)) continue;
      if (e.to !== EXIT && runningOf(r.nodes[e.to]?.running ?? MISSING_FLAG) !== true) continue;
      out.add(e.id);
      if (!seen.has(e.to)) { seen.add(e.to); queue.push(e.to); }
    }
  }
  return out;
}

/** Running machines the walk never reached: an inconsistency to report, not to hide. */
export function orphanRunning(r: TwinRoute, active: Set<string>): string[] {
  const reached = new Set(r.edges.filter((e) => active.has(e.id)).map((e) => e.to));
  return Object.values(r.nodes).filter((n) => runningOf(n.running) === true && !reached.has(n.id)).map((n) => n.id);
}

/** Everything a selection lights: the machine and its whole path, upstream and downstream, along open edges (spec C4). */
export function litSet(r: TwinRoute, sel: string | null): Set<string> | null {
  if (!sel) return null;
  const lit = new Set<string>([sel]);
  const walk = (start: string, dir: 'up' | 'down') => {
    const stack = [start];
    while (stack.length) {
      const at = stack.pop()!;
      for (const e of r.edges) {
        if (!isOpen(e, r)) continue;
        const [a, b] = dir === 'down' ? [e.from, e.to] : [e.to, e.from];
        if (a !== at || lit.has(e.id)) continue;
        lit.add(e.id); lit.add(b); stack.push(b);
      }
    }
  };
  walk(sel, 'up'); walk(sel, 'down');
  return lit;
}

/* ------------------------------ node building ----------------------------- */

interface RawNode {
  id: string; name: string; kind: TwinMachine; row: string; section: string;
  on: boolean | null; at: string | null;
  currentA: number | null; rpm?: number | null; forceT?: number | null;
}

/** Judge one machine's signals; `refA`, `load`, `speed` and the state come once the section is known. */
function nodeOf(raw: RawNode, now: number): TwinNode {
  const ts = ms(raw.at);
  return {
    id: raw.id, name: raw.name, kind: raw.kind, row: raw.row, section: raw.section,
    running: assessFlag({ value: raw.on, ts }, RUNNING, now),
    current: assess({ value: raw.currentA, ts }, CURRENT, now),
    rpm: raw.rpm === undefined ? null : assess({ value: raw.rpm, ts }, RPM, now),
    forceT: raw.forceT === undefined ? null : assess({ value: raw.forceT, ts }, FORCE_T, now),
    ratedA: ratingOf(raw.id).ratedA, refA: null, refKind: null, load: null, speed: null,
    state: 'unknown', tone: 'na', lines: [],
  };
}

/**
 * Each node's state once its section is known: running (lamp filled) · stopped while the
 * section runs = FAULT, the whole machine red (guide §10.3) · stopped with the section = idle ·
 * unknown when the running signal is stale or missing. A suspect current is a WARNING; a
 * current at ≥ 90 % / 100 % of a configured RATING is warning / fault (spec C3).
 */
function finishSection(nodes: TwinNode[], speedOf: (n: TwinNode) => number | null) {
  const maxA = Math.max(0, ...nodes.map((n) => (runningOf(n.running) ? good(n.current) ?? 0 : 0)));
  const partial = nodes.some((n) => runningOf(n.running) === true) && nodes.some((n) => runningOf(n.running) === false);
  for (const n of nodes) {
    const on = runningOf(n.running);
    n.refA = n.ratedA ?? (maxA > 0 ? maxA : null);
    n.refKind = n.ratedA !== null ? 'rated' : n.refA !== null ? 'section-max' : null;
    const a = good(n.current);
    n.load = on && a !== null && n.refA !== null ? clamp01(a / n.refA) : null;
    n.speed = on ? speedOf(n) : null;
    if (on === null) { n.state = 'unknown'; n.tone = 'na'; continue; }
    if (!on) { n.state = partial ? 'fault' : 'stopped'; n.tone = partial ? 'risk' : 'na'; continue; }
    const ratio = n.ratedA !== null && a !== null ? a / n.ratedA : null;
    if (ratio !== null && ratio >= BAR_RISK) { n.state = 'fault'; n.tone = 'risk'; continue; }
    if ((ratio !== null && ratio >= BAR_WARN) || n.current.quality === 'suspect') { n.state = 'warning'; n.tone = 'warn'; continue; }
    n.state = 'running'; n.tone = 'ok';
  }
}

/** The route of a row: infeed → first → … → last → exit, each node owning the edge it feeds. A row with no machines has no route. */
function chainRow(nodes: TwinNode[], edges: TwinEdge[]) {
  if (!nodes.length) return;
  const seq = [INFEED, ...nodes.map((n) => n.id), EXIT];
  for (let i = 0; i + 1 < seq.length; i += 1) {
    const id = runKey(seq[i], seq[i + 1]);
    edges.push({ id, from: seq[i], to: seq[i + 1] });
    nodes.find((n) => n.id === seq[i])?.lines.push(id);
  }
}

function issuesOf(nodes: TwinNode[], extra: { name: string; s: Signal }[]): TwinModel['issues'] {
  const stale: string[] = []; const suspect: string[] = [];
  for (const n of nodes) {
    if (n.running.quality === 'stale' || n.current.quality === 'stale') stale.push(n.name);
    if (n.current.quality === 'suspect') suspect.push(n.name);
  }
  for (const x of extra) {
    if (x.s.quality === 'stale') stale.push(x.name);
    if (x.s.quality === 'suspect') suspect.push(x.name);
  }
  return { stale, suspect };
}

function assemble(
  mill: TwinMill, now: number, rows: TwinRow[], nodes: TwinNode[], edges: TwinEdge[],
  infeed: TwinModel['infeed'], exit: TwinModel['exit'], extraIssues: { name: string; s: Signal }[], live: boolean,
): TwinModel {
  const route: TwinRoute = { nodes: Object.fromEntries(nodes.map((n) => [n.id, n])), edges, diverters: {} };
  const active = activeEdges(route);
  return {
    mill, live, now, infeed, exit, rows, route, active,
    orphans: orphanRunning(route, active),
    issues: issuesOf(nodes, extraIssues),
    totals: { on: nodes.filter((n) => runningOf(n.running) === true).length, total: nodes.length },
  };
}

/* ---------------------------------- HSM ----------------------------------- */

/** HSM: one row — Roughing RM1–RM5, Finishing FM1–FM6 — from /api/hsm/live and the Production card. */
export function hsmTwinModel(live: HsmLive | null, exitMt: number | null, now: number, isLive = true): TwinModel {
  const nodes: TwinNode[] = (live?.stands ?? []).map((s) => nodeOf({
    id: s.id, name: s.id.replace('_0', ''), kind: 'stand', row: 'hsm', section: s.group,
    on: s.on, at: s.at, currentA: s.currentA, rpm: s.rpm, forceT: s.forceT,
  }, now));
  const sections: TwinSection[] = (live?.groups ?? []).map((g) => {
    const mine = nodes.filter((n) => n.section === g.id);
    const maxRpm = Math.max(0, ...mine.map((n) => (runningOf(n.running) ? good(n.rpm) ?? 0 : 0)));
    finishSection(mine, (n) => { const r = good(n.rpm); return r !== null && r > 0 && maxRpm > 0 ? clamp01(r / maxRpm) : null; });
    return { id: g.id, label: g.label.replace(/ group$/i, ''), nodeIds: mine.map((n) => n.id), on: mine.filter((n) => runningOf(n.running) === true).length, total: mine.length };
  });
  const edges: TwinEdge[] = [];
  chainRow(nodes, edges);
  const lastTs = ms(live?.lastReadingAt);
  const billets = assess({ value: live?.billetsToday ?? null, ts: lastTs }, BILLETS, now);
  const speed = assess({ value: live?.millSpeed ?? null, ts: lastTs }, HSM_MILL_SPEED, now);
  /* The roughing mill speed is a normalised feedback: ≈0.1 idle, 0.8–1.0 rolling; below 0.3 the
     mill is stopped — a measurement, so the run holds still. */
  const sv = good(speed);
  const speedNorm = sv === null ? null : sv < 0.3 ? 0 : clamp01(sv);
  const rows: TwinRow[] = [{ id: 'hsm', label: '', sections, speed: null, speedNorm }];
  return assemble('hsm', now, rows, nodes, edges,
    { billets, period: live ? { label: 'Plant day', start: Date.parse(live.plantDayStart) } : null, speed: { signal: speed, spec: HSM_MILL_SPEED, unit: '', dp: 2 }, speedNorm },
    { mt: exitMt, sub: 'PERIOD' }, [{ name: 'Billets', s: billets }, { name: 'Mill speed', s: speed }], isLive);
}

/* ---------------------------------- RMD ----------------------------------- */

/** Which machine a station is, from the label the dashboard gives it. */
export const machineOf = (zone: 'route' | 'finishing', label: string): TwinMachine =>
  (zone === 'route' ? 'stand' : /^TB/i.test(label) ? 'tb' : /^PR/i.test(label) ? 'pinch' : 'shear');

/**
 * RMD: a row per line — its 10" stands (route) then its finishing machines, in the order the
 * dashboard lists them — from /api/rmd/live, each line's mill speed and the ERP production.
 */
export function rmdTwinModel(
  live: RmdLive | null, mps: RmdMillSpeedReport['latest'] | null, exitMt: number | null, now: number, isLive = true,
): TwinModel {
  const nodes: TwinNode[] = [];
  const edges: TwinEdge[] = [];
  const speedTs = ms(mps?.at);
  const lineSpeeds = ([1, 2] as const).map((line) => assess({ value: line === 1 ? mps?.mill1 ?? null : mps?.mill2 ?? null, ts: speedTs }, LINE_MPS, now));
  const fastest = Math.max(0, ...lineSpeeds.map((s) => good(s) ?? 0));
  const rows: TwinRow[] = ([1, 2] as const).map((line) => {
    const sig = lineSpeeds[line - 1];
    const v = good(sig);
    const speedNorm = v === null ? null : fastest > 0 ? clamp01(v / fastest) : 0;
    const mine: TwinNode[] = [];
    const sections: TwinSection[] = [];
    for (const zone of ['route', 'finishing'] as const) {
      const zs = (live?.stations ?? []).filter((s) => s.line === line && s.zone === zone).map((s) => nodeOf({
        id: s.id, name: s.label, kind: machineOf(zone, s.label), row: `line${line}`, section: zone,
        on: s.on, at: s.at, currentA: s.currentA,
      }, now));
      if (!zs.length) continue;
      /* A line's runs move at the line's measured speed: the only speed the plant publishes. */
      finishSection(zs, () => (speedNorm !== null && speedNorm > 0 ? speedNorm : null));
      const label = live?.zones.find((z) => z.id === zone)?.label.replace(/ group$/i, '') ?? (zone === 'route' ? 'Route' : 'Finishing');
      sections.push({ id: `${line}-${zone}`, label, nodeIds: zs.map((n) => n.id), on: zs.filter((n) => runningOf(n.running) === true).length, total: zs.length });
      mine.push(...zs);
    }
    chainRow(mine, edges);
    nodes.push(...mine);
    return { id: `line${line}`, label: `Line ${line}`, sections, speed: { signal: sig, spec: LINE_MPS, unit: 'm/s', dp: 1 }, speedNorm };
  });
  const billets = assess({ value: live?.billetsToday ?? null, ts: ms(live?.lastReadingAt) }, BILLETS, now);
  return assemble('rmd', now, rows, nodes, edges,
    { billets, period: live ? { label: 'RMD day', start: Date.parse(live.plantDayStart) } : null, speed: null, speedNorm: null },
    { mt: exitMt, sub: 'PERIOD' },
    [{ name: 'Billets', s: billets }, { name: 'Line 1 speed', s: lineSpeeds[0] }, { name: 'Line 2 speed', s: lineSpeeds[1] }], isLive);
}

/* ------------------------- for the live store's clock --------------------- */

/** The source timestamps in a live answer and how long each stays fresh. */
export const hsmLiveEdges = (d: HsmLive) => [
  ...d.stands.map((s) => ({ ts: ms(s.at), staleAfterMs: RUNNING.staleAfterMs })),
  { ts: ms(d.lastReadingAt), staleAfterMs: BILLETS.staleAfterMs },
];
export const rmdLiveEdges = (d: RmdLive) => [
  ...d.stations.map((s) => ({ ts: ms(s.at), staleAfterMs: RUNNING.staleAfterMs })),
  { ts: ms(d.lastReadingAt), staleAfterMs: BILLETS.staleAfterMs },
];
export const rmdSpeedEdges = (d: RmdMillSpeedReport) => [{ ts: ms(d.latest.at), staleAfterMs: LINE_MPS.staleAfterMs }];
