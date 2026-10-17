import { test, expect } from '@playwright/test';
import { resolveFlow, pctOfFed, type MillFlowInput, type Qty } from '@/models/millFlow';
import { runTime, type OperatingInput } from '@/models/operating';
import { resolveStock } from '@/models/stock';
import { resolveOrders } from '@/models/orders';
import { resolveMill } from '@/models/millModel';
import { HSM_SAMPLE } from '@/components/visualization/hsmSample';

const t = (mt: number | null): Qty => ({ mt, count: null, countUnit: null, basis: 'measured' });
const FLOW = HSM_SAMPLE.flow;
const withQc = (patch: Partial<MillFlowInput['qc']>): MillFlowInput => ({ ...FLOW, qc: { ...FLOW.qc, ...patch } });

test.describe('material flow', () => {
  test('derives rolled and process loss, and the chain closes', () => {
    const f = resolveFlow(FLOW);
    expect(f.rolled).toMatchObject({ mt: 350.2, count: 279, basis: 'derived' });
    expect(f.processLoss).toMatchObject({ mt: 8.2, count: null, basis: 'derived' });
    expect(f.checks.every((c) => c.ok)).toBe(true);
    expect(f.balanced).toBe(true);

    // Every terminal bucket adds back to what was fed.
    const terminal = [
      f.accepted.withOrder.mt, f.accepted.free.mt, f.qc.onHold.mt,
      f.qc.rejected.mt, f.inlineReject.mt, f.processLoss.mt,
    ].reduce((a, b) => a! + b!, 0)!;
    expect(terminal).toBeCloseTo(f.fed.mt!, 6);
    expect(pctOfFed(f, f.qc.accepted.mt)).toBeCloseTo(93.22, 2);
  });

  test('QC split that does not add up to output is flagged with its gap', () => {
    const f = resolveFlow(withQc({ onHold: t(5.0) }));
    const c = f.checks.find((x) => x.id === 'qc')!;
    expect(c.ok).toBe(false);
    expect(c.gap).toBeCloseTo(3.0, 6);
    expect(f.balanced).toBe(false);
  });

  test('output heavier than billets rolled is a data problem, not a gain', () => {
    const f = resolveFlow({ ...FLOW, output: { ...FLOW.output, mt: 352.0 } });
    expect(f.processLoss.mt).toBeCloseTo(-1.8, 6);
    expect(f.checks.find((x) => x.id === 'fed')!.ok).toBe(false);
  });

  test('a missing figure makes the balance unknown, not wrong', () => {
    const f = resolveFlow(withQc({ onHold: t(null) }));
    expect(f.checks.find((x) => x.id === 'qc')!.ok).toBeNull();
    expect(f.balanced).toBeNull();
  });

  test('size split must add up to the order split', () => {
    const bySize = FLOW.output.bySize.map((r, i) => (i === 0 ? { ...r, free: 25 } : r));
    const f = resolveFlow({ ...FLOW, output: { ...FLOW.output, bySize } });
    expect(f.checks.find((x) => x.id === 'output.size.free')).toMatchObject({ ok: false, gap: -5 });
  });
});

test.describe('run time from power', () => {
  const MIN = 60_000;
  const t0 = Date.UTC(2026, 0, 1);
  const op = (kw: number[]): OperatingInput => ({
    meter: 'test',
    detection: { idleKw: 100, minStopMin: 3, stepMs: MIN },
    series: kw.map((k, i) => ({ ts: t0 + i * MIN, kw: k })),
  });

  test('dips shorter than the minimum are billet gaps, not stops', () => {
    // 10 min: running, 2-min dip, running, 3-min stop, running.
    const r = runTime(op([500, 500, 50, 50, 500, 50, 50, 50, 500, 500]), t0, t0 + 10 * MIN);
    expect(r.stops).toEqual([{ fromMs: t0 + 5 * MIN, toMs: t0 + 8 * MIN }]);
    expect(r.stopH * 60).toBeCloseTo(3, 6);
    expect(r.runH * 60).toBeCloseTo(7, 6);
    expect(r.idleEnergyMwh * 1000).toBeCloseTo((3 * 50) / 60, 6);
  });

  test('missing readings shrink coverage instead of counting as a stop', () => {
    const series = op(Array(10).fill(500)).series.filter((_, i) => i < 4 || i > 6);
    const r = runTime({ ...op([]), series }, t0, t0 + 10 * MIN);
    expect(r.coveredH * 60).toBe(7);
    expect(r.stopH).toBe(0);
  });

  test('shifts partition the day exactly', () => {
    const m = resolveMill(HSM_SAMPLE);
    const sumRun = m.shifts.reduce((s, x) => s + x.run.runH, 0);
    expect(sumRun).toBeCloseTo(m.run.runH, 9);
    expect(m.shifts.map((s) => Number(s.run.runH.toFixed(1)))).toEqual([10.6, 11.0]);   // Day, Night
  });
});

test.describe('stock ledger', () => {
  test('movements reproduce the closing stock; a wrong closing is flagged', () => {
    const good = resolveStock(HSM_SAMPLE.stock);
    expect(good.balanced).toBe(true);
    expect([good.withOrder, good.free, good.total]).toEqual([420, 210, 630]);

    const sizes = HSM_SAMPLE.stock.sizes.map((s, i) => (i === 0 ? { ...s, closing: { ...s.closing, free: 55 } } : s));
    const bad = resolveStock({ sizes });
    expect(bad.checks.find((c) => c.id === 'stock.8 mm.free')).toMatchObject({ ok: false, gap: -5 });
  });

  test('allocation moves tonnes between marks without changing the total', () => {
    const s = HSM_SAMPLE.stock.sizes[0];
    const moved = resolveStock({ sizes: [{ ...s, allocated: s.allocated! + 10, closing: { withOrder: s.closing.withOrder! + 10, free: s.closing.free! - 10 } }] });
    expect(moved.balanced).toBe(true);
    expect(moved.total).toBe(resolveStock({ sizes: [s] }).total);
  });
});

test.describe('orders', () => {
  test('500 MT order: 100 from stock + 400 produced leaves nothing to produce', () => {
    const { orders, checks } = resolveOrders(HSM_SAMPLE.orders);
    const o = orders.find((x) => x.id === 'SO-2611')!;
    expect(o.toProduceMt).toBe(0);
    expect(o.awaitingDispatchMt).toBe(250);
    expect(checks.every((c) => c.ok)).toBe(true);
  });

  test('over-covering an order is flagged', () => {
    const { checks } = resolveOrders([{ id: 'X', size: '8 mm', qtyMt: 100, fromStockMt: 50, producedMt: 60, dispatchedMt: 0 }]);
    expect(checks.find((c) => c.id === 'order.X.cover')!.ok).toBe(false);
  });
});

test.describe('whole model', () => {
  test('sample reproduces every KPI on the approved comp, and all checks pass', () => {
    const m = resolveMill(HSM_SAMPLE);
    const k = m.kpis;
    expect(m.checks.filter((c) => c.ok !== true)).toEqual([]);
    expect(m.balanced).toBe(true);

    expect(k.productionMt).toBe(342);
    expect(k.planMt).toBe(360);
    expect(k.planPct).toBeCloseTo(95, 6);
    expect(k.planGapMt).toBe(-18);   // production − plan: short by 18
    expect(k.yieldPct!.toFixed(1)).toBe('96.6');
    expect(k.massDiffMt).toBe(12);
    expect(k.runH!.toFixed(1)).toBe('21.6');
    expect(k.nonRunH!.toFixed(1)).toBe('2.4');
    expect(k.availabilityPct!.toFixed(1)).toBe('90.0');
    expect(k.runningRateTph!.toFixed(2)).toBe('15.83');
    expect(k.billetRatePerH!.toFixed(2)).toBe('13.06');
    expect(k.energyMwh!.toFixed(2)).toBe('30.78');
    expect(k.specificEnergyKwhPerMt!.toFixed(1)).toBe('90.0');
    expect(k.productionFreeMt).toBe(72);
    expect(k.productionFreePct!.toFixed(1)).toBe('21.1');
    expect(m.stock.withOrderPct!.toFixed(1)).toBe('66.7');
    expect(m.run.stops).toHaveLength(5);
  });

  test('shift totals that disagree with the day are flagged', () => {
    const shifts = HSM_SAMPLE.shifts.map((s, i) => (i === 1 ? { ...s, output: t(162) } : s));   // Night 170 → 162
    const m = resolveMill({ ...HSM_SAMPLE, shifts });
    expect(m.checks.find((c) => c.id === 'shifts.output')).toMatchObject({ ok: false, gap: 8 });
    expect(m.balanced).toBe(false);
  });
});
