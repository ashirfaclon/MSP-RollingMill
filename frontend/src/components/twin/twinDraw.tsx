'use client';

/**
 * The drawing primitives every twin draws with (process-twin-guide §5, improvement-spec C2,
 * C3, C8) — process-agnostic: where a sprite lands in its box, where its nozzles are, how a
 * measured speed becomes movement, the pass-line run in its three states, the lamp in its five
 * shapes, the reading with its quality, and the reference bar under it.
 *
 * The `.mx-*` class names are the CPP mimic's, so its stylesheet rules carry over.
 */
import SPRITES from './twinSprites.json';
import { readingText, type Quality, type Signal } from './signal';
import type { LampState, TwinTone } from './twinModel';
import type { SignalSpec } from './twinSignals';

export interface Box { x: number; y: number; w: number; h: number; cx: number }

interface SpriteDef { w: number; h: number; pxPerM?: number; nozzles: Record<string, number[]> }
const MANIFEST = SPRITES as Record<string, SpriteDef>;

/** The aspect each sprite was baked at, from the renderer's own manifest — never hand-kept. */
export const SPRITE_ASPECT = Object.fromEntries(Object.entries(MANIFEST).map(([k, v]) => [k, v.w / v.h])) as Record<string, number>;

/* ------------------------------ sprite geometry --------------------------- */

/**
 * The box a sprite occupies when every machine is drawn at ONE scale (`pxPerM` drawing pixels
 * per metre) and stands with its BASE POINT on `floorY` — not its bottom edge, which is the
 * shadow it casts and reaches a different distance below the floor on each machine. All
 * machines at one scale on one floor is what makes the pass line one straight line (spec C6).
 */
export function spriteBox(sprite: string, cx: number, floorY: number, pxPerM: number): Box {
  const d = MANIFEST[sprite];
  const scale = pxPerM / (d?.pxPerM ?? 1);
  const w = (d?.w ?? 60) * scale;
  const h = (d?.h ?? 60) * scale;
  const base = d?.nozzles.base ?? [0.5, 1];
  /* Placed by the BASE POINT in both axes: a machine's hot-bar render is wider than its idle one
     (the glow widens the trimmed sprite), so centring the sprite would shift the machine sideways
     the moment it starts rolling. */
  const y = floorY - base[1] * h;
  const x = cx - base[0] * w;
  return { x, y, w, h, cx };
}

/** Where a sprite actually lands inside a box given to it (`xMidYMax meet`): used when a box is not already the sprite's own. */
export function fit(b: Box, aspect: number): Box {
  const w = Math.min(b.w, b.h * aspect);
  const h = w / aspect;
  const x = b.x + (b.w - w) / 2;
  const y = b.y + b.h - h;
  return { x, y, w, h, cx: x + w / 2 };
}

/** A nozzle in drawing coordinates: the manifest's fraction of the sprite, projected by the renderer. `b` is the sprite's own box. */
export function nozzle(b: Box, sprite: string, id: string, flip = false): [number, number] {
  const n = MANIFEST[sprite]?.nozzles?.[id];
  if (!n) return [b.cx, b.y + b.h / 2];
  return [b.x + (flip ? 1 - n[0] : n[0]) * b.w, b.y + n[1] * b.h];
}

/** Metres across and tall a sprite is, for sizing the layout's scale. */
export const spriteMetres = (sprite: string) => {
  const d = MANIFEST[sprite];
  return d?.pxPerM ? { w: d.w / d.pxPerM, h: d.h / d.pxPerM } : { w: 4, h: 4 };
};

/* --------------------------------- flow ---------------------------------- */

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * How a normalised speed (0..1, from the model, good signals only) becomes movement. `null`
 * does not animate at all — an unmeasured run must never look like a moving one.
 */
export function flowOf(speed: number | null, load: number | null = speed): { dur: number; load: number } | null {
  if (speed === null || speed <= 0.02) return null;
  return { dur: 3.4 - 2.3 * clamp01(speed), load: clamp01(load ?? 0) };
}

/** A run's state (spec C1): carrying steel · an idle branch · unknown (a diverter signal stale). */
export type RunState = 'active' | 'idle' | 'unknown';

/** One geometry, three roles: the bed, the line (weight from load) and the travelling dashes. */
export function Run({ d, flow, k, on, state }: { d: string; flow: { dur: number; load: number } | null; k: string; on: boolean; state: RunState }) {
  const load = state === 'active' ? flow?.load ?? 0 : 0;
  return (
    <g className={`mx-pipe mx-pipe--steel mx-pipe--${state}${on ? ' is-on' : ''}`} data-k={k}>
      <path className="mx-pipe-bed" d={d} />
      <path className="mx-pipe-line" d={d} style={{ opacity: 0.6 + 0.35 * load, strokeWidth: 2.3 + 1.5 * load }} />
      {state === 'active' && flow !== null && (
        <path className="mx-pipe-flow" d={d} style={{ animationDuration: `${flow.dur}s`, opacity: 0.7 + 0.3 * load }} />
      )}
    </g>
  );
}

/* --------------------------------- lamp ----------------------------------- */

/**
 * The status lamp, one shape per state so state never rests on colour (spec C8): running a
 * filled circle, stopped a hollow one, warning a triangle, fault a square, unknown a dashed
 * hollow circle. Anchored by the caller to the sprite's real top-right corner.
 */
export function Lamp({ x, y, state, label }: { x: number; y: number; state: LampState; label: string }) {
  const r = 4.5;
  return (
    <g className={`mx-lamp mx-lamp--${state}`} role="img" aria-label={label}>
      <title>{label}</title>
      <circle className="mx-lamp-halo" cx={x} cy={y} r={7} />
      {state === 'running' && <circle className="mx-lamp-core" cx={x} cy={y} r={r} />}
      {state === 'stopped' && <circle className="mx-lamp-ring" cx={x} cy={y} r={r} />}
      {state === 'unknown' && <circle className="mx-lamp-ring mx-lamp-ring--dashed" cx={x} cy={y} r={r} />}
      {state === 'warning' && <path className="mx-lamp-core" d={`M${x} ${y - 5.5} L${x + 5.5} ${y + 4.5} H${x - 5.5} Z`} />}
      {state === 'fault' && <rect className="mx-lamp-core" x={x - 4.5} y={y - 4.5} width={9} height={9} rx={1} />}
    </g>
  );
}

/* -------------------------------- readings -------------------------------- */

/**
 * The one readout: a value and its unit in its own lane under the machine, written by its
 * quality — plainly when good, grey with its age when stale, with "?" in amber when suspect,
 * "NA" when missing (spec C2). `text` overrides the figure (e.g. "Off").
 */
export function Readout({ cx, y, signal, spec, now, unit, dp = 0, small, anchor = 'middle', text, accumulated }: {
  cx: number; y: number; signal: Signal; spec: SignalSpec; now: number; unit: string; dp?: number; small?: boolean;
  anchor?: 'middle' | 'end' | 'start'; text?: string;
  /** A total over a period, not a live reading: the quieter ink (spec C7). */
  accumulated?: boolean;
}) {
  const r = text !== undefined ? { text, suffix: '', quality: 'good' as Quality } : readingText(signal, spec, now, dp);
  const na = r.quality === 'missing';
  return (
    <text className={`mx-read${small ? ' mx-read--sm' : ''}${na ? ' is-na' : ''} mx-read--${r.quality}${accumulated ? ' mx-read--total' : ''}`} x={cx} y={y} textAnchor={anchor}>
      {r.text}
      {!na && unit && text === undefined && <tspan className="mx-read-unit"> {unit}</tspan>}

    </text>
  );
}

/**
 * The reference bar (spec C3): fill = load, colour = tone, a tick at the setpoint when one
 * exists. None for a missing or suspect signal; faint for a stale one.
 */
export function RefBar({ cx, y, load, tone, quality, setpoint, w = 40 }: {
  cx: number; y: number; load: number | null; tone: TwinTone; quality: Quality; setpoint?: number | null; w?: number;
}) {
  if (load === null || quality === 'missing' || quality === 'suspect') return null;
  const x = cx - w / 2;
  return (
    <g className={`mx-bar mx-bar--${tone}${quality === 'stale' ? ' is-stale' : ''}`}>
      <rect className="mx-bar-track" x={x} y={y} width={w} height={3} rx={1.5} />
      <rect className="mx-bar-fill" x={x} y={y} width={w * clamp01(load)} height={3} rx={1.5} />
      {setpoint !== null && setpoint !== undefined && <rect className="mx-bar-tick" x={x + w * clamp01(setpoint) - 0.5} y={y - 1.5} width={1} height={6} />}
    </g>
  );
}

/** The 2 px ring round a selected machine (spec C4). */
export function SelectRing({ b }: { b: Box }) {
  return <rect className="mx-select" x={b.x - 3} y={b.y - 3} width={b.w + 6} height={b.h + 6} rx={5} />;
}

/* ------------------------------- materials -------------------------------- */

/** The filters every sprite and run refers to by id. One copy per document. */
export function TwinDefs() {
  return (
    <defs>
      <filter id="mx-glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="2.8" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
  );
}
