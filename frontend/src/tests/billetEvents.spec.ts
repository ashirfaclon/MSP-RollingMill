/**
 * Billet-size events and the input tonnage they give — units and event boundaries, no
 * plant access. Times are the real changes seen in the historian.
 */
import { test, expect } from '@playwright/test';
import { billetWeightT, sizeEvents, weighBillets, type Steps } from '@/server/hsm/yield';

const at = (s: string) => Date.parse(`${s}+05:30`);

test('billet weight: m × mm × mm × g/cm³ → t', () => {
  // 3 m × 275 mm × 125 mm = 0.103125 m³; × 7.832 t/m³ = 0.807675 t.
  expect(billetWeightT(3, 275, 125)).toBeCloseTo(0.807675, 6);
  // 3.2 m × 160 mm × 160 mm = 0.08192 m³ × 7.832 = 0.64160 t.
  expect(billetWeightT(3.2, 160, 160)).toBeCloseTo(0.6415974, 6);
});

test('each change of L, B or H is a new event; changes seconds apart are one', () => {
  const w: Steps = [{ t: at('2026-09-21T12:47:25'), v: 160 }, { t: at('2026-09-23T06:16:28'), v: 275 }, { t: at('2026-09-28T09:16:10'), v: 160 }];
  const h: Steps = [{ t: at('2026-09-21T12:47:25'), v: 160 }, { t: at('2026-09-23T06:16:28'), v: 125 }, { t: at('2026-09-28T09:16:10'), v: 160 }];
  const l: Steps = [
    { t: at('2026-09-21T12:47:25'), v: 3.6 },
    { t: at('2026-09-23T06:16:38'), v: 3.2 },   // 10 s after B/H: the same size change
    { t: at('2026-09-23T10:03:01'), v: 3.0 },
    { t: at('2026-09-28T09:16:20'), v: 3.2 },   // 10 s after B/H again
  ];
  const ev = sizeEvents(h, w, l);
  expect(ev.map((e) => [e.lengthM, e.breadthMm, e.heightMm])).toEqual([[3.6, 160, 160], [3.2, 275, 125], [3, 275, 125], [3.2, 160, 160]]);
  // The event starts at the first change and takes the size once the length has landed too.
  expect(ev[1].start).toBe(at('2026-09-23T06:16:28'));
  expect(ev[1].end).toBe(at('2026-09-23T10:03:01'));
  expect(ev[3].start).toBe(at('2026-09-28T09:16:10'));
  expect(ev[3].end).toBeNull();

  // Billets are weighed by the event they were discharged in — including one inside the
  // 10 s gap, which gets the settled size, not the half-set 275 × 125 × 3.6.
  const { tonnes, unweighed } = weighBillets([
    { t: at('2026-09-22T12:00:00'), v: 2 },     // 3.6 × 160 × 160
    { t: at('2026-09-23T06:16:30'), v: 1 },     // in the gap → 3.2 × 275 × 125
    { t: at('2026-09-24T12:00:00'), v: 10 },    // 3.0 × 275 × 125
    { t: at('2026-09-21T10:00:00'), v: 1 },     // before any size is known
  ], ev);
  expect(tonnes.map((x) => +x.v.toFixed(4))).toEqual([
    +(2 * billetWeightT(3.6, 160, 160)).toFixed(4),
    +billetWeightT(3.2, 275, 125).toFixed(4),
    +(10 * billetWeightT(3, 275, 125)).toFixed(4),
  ]);
  expect(unweighed).toBe(1);
});

test('a change that lands back on the same size is not a new event', () => {
  const w: Steps = [{ t: 0, v: 160 }];
  const h: Steps = [{ t: 0, v: 160 }];
  const l: Steps = [{ t: 0, v: 3.6 }, { t: 3_600_000, v: 3.6 }];
  expect(sizeEvents(h, w, l)).toHaveLength(1);
});
