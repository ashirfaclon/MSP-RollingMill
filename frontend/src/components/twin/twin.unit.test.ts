/**
 * The twins' model (mill-mimic-improvement-spec §6): signal quality, the active path, the
 * trace, the flow rule, period labels — and the baked geometry (C6).
 */
import { describe, expect, test } from 'vitest';
import SPRITES from './twinSprites.json';
import { assess, periodLabel, readingText } from './signal';
import { activeEdges, hsmTwinModel, litSet, orphanRunning, rmdTwinModel, runKey } from './twinModel';
import { flowOf, nozzle, spriteBox } from './twinDraw';
import { HSM_FIXTURES, NOW, RMD_FIXTURES } from './twinFixtures';
import { CURRENT } from './twinSignals';

describe('signal quality', () => {
  test('missing, stale, suspect, good — and null never becomes 0', () => {
    expect(assess({ value: null, ts: NOW }, CURRENT, NOW).quality).toBe('missing');
    expect(assess({ value: 10, ts: null }, CURRENT, NOW).quality).toBe('missing');
    expect(assess({ value: 10, ts: NOW - CURRENT.staleAfterMs - 1 }, CURRENT, NOW).quality).toBe('stale');
    expect(assess({ value: -4, ts: NOW }, CURRENT, NOW)).toMatchObject({ value: -4, quality: 'suspect' });
    expect(assess({ value: 0, ts: NOW }, CURRENT, NOW).quality).toBe('good');
  });
  test('how a reading is written: plain · with age · with "?" · ≈0 inside a confirmed zero band', () => {
    expect(readingText(assess({ value: 24, ts: NOW - 3 * 60_000 - CURRENT.staleAfterMs }, CURRENT, NOW), CURRENT, NOW)).toMatchObject({ text: '24', suffix: ' · 18m', quality: 'stale' });
    expect(readingText(assess({ value: -4, ts: NOW }, CURRENT, NOW), CURRENT, NOW).text).toBe('-4 ?');
    const band = { ...CURRENT, zeroBand: 5 };
    expect(readingText(assess({ value: -4, ts: NOW }, band, NOW), band, NOW)).toMatchObject({ text: '≈0', quality: 'good' });
  });
  test('flowOf accepts only a measured speed', () => {
    expect(flowOf(null)).toBeNull();
    expect(flowOf(0)).toBeNull();
    expect(flowOf(1)!.dur).toBeCloseTo(1.1);
    expect(flowOf(0.5, 0.2)).toMatchObject({ load: 0.2 });
  });
  test('period labels carry the date once the day has turned', () => {
    const start = Date.parse('2026-10-29T03:30:00.000Z');   // 09:00 IST
    expect(periodLabel({ label: 'Plant day', start }, NOW)).toBe('SINCE 09:00 IST');
    expect(periodLabel({ label: 'Plant day', start }, NOW + 24 * 3600_000)).toBe('SINCE 29 OCT 09:00 IST');
  });
});

describe('route', () => {
  test('HSM rolling: the path runs from the infeed through every running stand; RM4 stops it short of RM5 → RM5 is an orphan', () => {
    const m = hsmTwinModel(HSM_FIXTURES.rolling, 1000, NOW);
    expect(m.active.has(runKey('infeed', 'RM_01'))).toBe(true);
    expect(m.active.has(runKey('RM_03', 'RM_04'))).toBe(false);
    expect(m.orphans).toEqual(['RM_05', 'FM_01', 'FM_02', 'FM_03', 'FM_04', 'FM_05']);
    expect(m.route.nodes.RM_04).toMatchObject({ state: 'fault', tone: 'risk', load: null, speed: null });
    expect(m.route.nodes.FM_06).toMatchObject({ state: 'unknown' });
    expect(m.route.nodes.RM_02.load).toBeCloseTo(1);           // the section's highest current
    expect(m.route.nodes.RM_02.refKind).toBe('section-max');
  });
  test('the 01:38 case: line 1 finishing running with no feed path → banner; line 2 stands active', () => {
    const f = RMD_FIXTURES.liveCrossover;
    const m = rmdTwinModel(f.live, f.mps, 2000, NOW);
    expect(m.active.has(runKey('infeed', 'L2_S1'))).toBe(true);
    expect(m.active.has(runKey('L2_S5', 'L2_S6'))).toBe(true);
    expect(m.active.has(runKey('L2_S6', 'L2_CS_On_Off'))).toBe(false);
    expect(m.orphans).toEqual(['L1_FS', 'L1_PRI', 'L1_PR2', 'L1_TB1', 'L1_TB2']);
    expect(orphanRunning(m.route, activeEdges(m.route))).toEqual(m.orphans);
    // FS at −4 A: suspect, a warning, never a plain good reading.
    expect(m.route.nodes.L1_FS).toMatchObject({ state: 'warning', tone: 'warn' });
    expect(m.route.nodes.L1_FS.current.quality).toBe('suspect');
    expect(m.issues.suspect).toEqual(['FS']);
  });
  test('line 2 all off while line 1 rolls: idle, not a fault', () => {
    const f = RMD_FIXTURES.rolling;
    const m = rmdTwinModel(f.live, f.mps, 2000, NOW);
    expect(m.route.nodes.L2_S1.state).toBe('stopped');
    expect(m.route.nodes.L1_S5.state).toBe('fault');
  });
  test('one stale stand: only it is stale, its run holds still, the pill knows', () => {
    const m = hsmTwinModel(HSM_FIXTURES.oneStale, 1000, NOW);
    expect(m.route.nodes.FM_03).toMatchObject({ state: 'unknown', speed: null });
    expect(m.route.nodes.FM_03.current.quality).toBe('stale');
    expect(m.route.nodes.FM_02.current.quality).toBe('good');
    expect(m.issues.stale).toEqual(['FM3']);
  });
  test('trace: selecting PRI lights the whole path, upstream to the infeed and downstream to the exit', () => {
    const f = RMD_FIXTURES.rolling;
    const m = rmdTwinModel(f.live, f.mps, 2000, NOW);
    const lit = litSet(m.route, 'L1_PRI')!;
    expect(lit.has('infeed')).toBe(true);
    expect(lit.has('L1_S1')).toBe(true);
    expect(lit.has(runKey('L1_FS', 'L1_PRI'))).toBe(true);
    expect(lit.has('L1_TB2')).toBe(true);
    expect(lit.has('exit')).toBe(true);
    expect(lit.has('L2_S1')).toBe(false);
    expect(litSet(m.route, null)).toBeNull();
  });
  test('everything null: no node runs, no path, no orphans', () => {
    const m = hsmTwinModel(HSM_FIXTURES.allNull, null, NOW);
    expect(m.active.size).toBe(0);
    expect(m.orphans).toEqual([]);
    expect(Object.values(m.route.nodes).every((n) => n.state === 'unknown')).toBe(true);
  });
});

describe('baked geometry (spec C6)', () => {
  const S = SPRITES as Record<string, { w: number; h: number; pxPerM?: number; nozzles: Record<string, number[]> }>;
  const PX_PER_M = 14;
  const floor = 100;
  const passY = (k: string, id: string) => nozzle(spriteBox(k, 300, floor, PX_PER_M), k, id)[1];
  test('every machine carries its scale and base point', () => {
    for (const [k, v] of Object.entries(S)) {
      expect(v.pxPerM, k).toBeGreaterThan(0);
      expect(v.nozzles.base, k).toBeDefined();
    }
  });
  test('connected nozzles share one pass-line height within 0.5 px at the drawn scale', () => {
    const ys = Object.keys(S).flatMap((k) => ['in', 'out'].filter((id) => S[k].nozzles[id]).map((id) => ({ k, id, y: passY(k, id) })));
    const ref = ys[0].y;
    for (const p of ys) expect(Math.abs(p.y - ref), `${p.k}.${p.id}`).toBeLessThanOrEqual(0.5);
  });
});
