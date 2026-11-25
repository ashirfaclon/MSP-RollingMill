/** RMS production from the ERP log sheet: a repeated identical entry counts once. */
import { describe, expect, test } from 'vitest';
import { distinctEntries, summariseRms } from '../../src/modules/rms/production.service';

// 1–6 Oct 2026 as the ERP holds them.
const ROWS = [
  { date: '2026-10-01', vrno: 'L5P26O01-0001', productionMt: 577.45, productionPcs: 694, inputPcs: 700, inputMt: 612.3, burningLossMt: 9.41, endCutMt: 21.6, missRollMt: 1.69, coldMt: 0, rejectMt: 2.15 },
  { date: '2026-10-01', vrno: 'L5P26O01-0002', productionMt: 577.45, productionPcs: 694, inputPcs: 700, inputMt: 612.3, burningLossMt: 9.41, endCutMt: 21.6, missRollMt: 1.69, coldMt: 0, rejectMt: 2.15 },
  { date: '2026-10-04', vrno: 'L5P26O04-0001', productionMt: 501.22, productionPcs: 577 },
  { date: '2026-10-04', vrno: 'L5P26O04-0002', productionMt: 67.23, productionPcs: 113 },
  { date: '2026-10-06', vrno: 'L5P26O06-0001', productionMt: 116.93, productionPcs: 185 },
  { date: '2026-10-06', vrno: 'L5P26O06-0002', productionMt: 365.67, productionPcs: 625 },
];

describe('RMS production', () => {
  test('the same day entered twice counts once; two different entries add — as the ERP received into stock', () => {
    const rows = distinctEntries(ROWS);
    expect(summariseRms('d', '1 Oct', ['2026-10-01'], rows)).toMatchObject({ productionMt: 577.45, billetsPcs: 700 });
    expect(summariseRms('d', '4 Oct', ['2026-10-04'], rows).productionMt).toBe(568.45);
    expect(summariseRms('d', '6 Oct', ['2026-10-06'], rows).productionMt).toBe(482.6);
  });
  test('billet input = INPUT_MT1 + INPUT_MT2; mass yield = production ÷ input; mass difference = input − production', () => {
    expect(summariseRms('d', '1 Oct', ['2026-10-01'], distinctEntries(ROWS))).toMatchObject({
      billetInputMt: 612.3, massDiffMt: 34.85, massYieldPct: 94.31,
    });
    // No input filled: no yield, no difference.
    expect(summariseRms('d', '4 Oct', ['2026-10-04'], distinctEntries(ROWS))).toMatchObject({ billetInputMt: null, massYieldPct: null, massDiffMt: null });
  });
  test('the five losses make up the mass difference', () => {
    const p = summariseRms('d', '1 Oct', ['2026-10-01'], distinctEntries(ROWS));
    expect(p).toMatchObject({ burningLossMt: 9.41, endCutMt: 21.6, missRollMt: 1.69, coldMt: 0, rejectMt: 2.15, lossesMt: 34.85 });
    expect(p.lossesMt).toBe(p.massDiffMt);
    expect(summariseRms('d', '4 Oct', ['2026-10-04'], distinctEntries(ROWS)).lossesMt).toBeNull();
  });
  test('a date with no entry is null', () => {
    expect(summariseRms('d', '2 Oct', ['2026-10-02'], distinctEntries(ROWS))).toMatchObject({ entryDays: 0, productionMt: null });
  });
});

test('actual and prime production apart (the user, 25 Nov 2026): PRODUCTION_MT is prime + defective', () => {
  // 24 Nov 2026 as the ERP holds it: PRODUCTION_MT 269.59 = PRIME_MT2 230.60 + DEFECTIVE_CUTMT2 38.99.
  const row = { date: '2026-11-24', vrno: 'L5P26N24-0001', productionMt: 269.59, productionPcs: 283, primeMt: 230.6 };
  expect(summariseRms('d', '24 Nov', ['2026-11-24'], [row])).toMatchObject({ productionMt: 269.59, primeMt: 230.6 });
  expect(summariseRms('d', '24 Nov', ['2026-11-24'], [{ ...row, primeMt: null }]).primeMt).toBeNull();
});

test('on-line rolling %: the ERP\'s per entry, weighted by billet input (the user, 25 Nov 2026)', () => {
  // 22–23 Nov 2026 as the ERP holds them: delivery 97.015 % on 360.10 MT input, 98.621 % on 465.60 MT.
  const e = (date: string, input: number, del: number, cast: number) => ({ date, vrno: `L5P-${date}`, productionMt: 300, productionPcs: 300, inputMt: input, rollingInDeliveryPct: del, rollingInCastingPct: cast });
  const rows = [e('2026-11-22', 360.1, 97.015, 95.116), e('2026-11-23', 465.6, 98.621, 93.301)];
  expect(summariseRms('d', '22 Nov', ['2026-11-22'], rows)).toMatchObject({ rollingInDeliveryPct: 97.02, rollingInCastingPct: 95.12 });
  // (97.015 × 360.10 + 98.621 × 465.60) ÷ 825.70
  expect(summariseRms('w', '22–23 Nov', ['2026-11-22', '2026-11-23'], rows).rollingInDeliveryPct).toBe(97.92);
  expect(summariseRms('d', '24 Nov', ['2026-11-24'], rows).rollingInDeliveryPct).toBeNull();
});

test('prime yield: prime ÷ billet input, over the entries with both (the user, 25 Nov 2026)', () => {
  // 22 Nov 2026 as the ERP holds it: PRIME_MT1 328.12 of INPUT_MT1 360.10 → 91.12 % (mass yield on the actual: 92.57 %).
  const e = (date: string, prime: number | null, input: number) => ({ date, vrno: `L5P-${date}`, productionMt: 333.34, productionPcs: 383, primeMt: prime, inputMt: input });
  expect(summariseRms('d', '22 Nov', ['2026-11-22'], [e('2026-11-22', 328.12, 360.1)])).toMatchObject({ primeYieldPct: 91.12, massYieldPct: 92.57 });
  // A day without prime filled is left out of both sums, not counted as billets with no prime.
  expect(summariseRms('w', '22–23 Nov', ['2026-11-22', '2026-11-23'], [e('2026-11-22', 328.12, 360.1), e('2026-11-23', null, 465.6)]).primeYieldPct).toBe(91.12);
});
