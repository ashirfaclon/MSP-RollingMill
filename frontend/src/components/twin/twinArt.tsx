'use client';

/**
 * The equipment — baked renders (tools/mimic-render), with the mill's live state drawn over
 * them (process-twin-guide §4). WHAT IS BAKED: the machine at rest, and a second render of
 * each rolling machine with the hot bar through it — the glow on the rolls and the floor is
 * light in the scene, not an overlay. WHAT STAYS LIVE AND VECTOR: the runs, flows, lamps,
 * readings and bars. TWO SPRITES PER MACHINE, one lit for each theme, chosen in CSS.
 */
import type { Box } from './twinDraw';

/**
 * One machine's body: the same render twice, lit for each theme, with CSS picking. `fault`:
 * the whole body goes red. `dim`: present and doing nothing — idle, or no reading.
 */
export function Sprite({ name, b, dim, fault, flip }: { name: string; b: Box; dim?: boolean; fault?: boolean; flip?: boolean }) {
  const body = (['dark', 'light'] as const).map((theme) => (
    <image
      key={theme}
      className={`mx-sprite mx-sprite--${theme}${fault ? ' is-fault' : dim ? ' is-idle' : ''}`}
      href={`/twin/${name}-${theme}.png`}
      x={b.x} y={b.y} width={b.w} height={b.h}
      preserveAspectRatio="xMidYMax meet"
    />
  ));
  if (!flip) return <>{body}</>;
  return <g transform={`translate(${2 * (b.x + b.w / 2)} 0) scale(-1 1)`}>{body}</g>;
}
