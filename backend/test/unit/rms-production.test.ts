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

test('on-line rolling %: Σ billet input ÷ Σ delivery / Σ cast, as the plant\'s casting sheet (the user, 26 Nov 2026)', () => {
  // "Casting Sheet November 26.xls" against the ERP: 11 Nov has two entries, 15 Nov's input is in INPUT_MT (synced as inputMt).
  const e = (date: string, vrno: string, input: number | null, del: number, cast: number, pctTypo: number | null = null) => ({
    date, vrno, productionMt: 300, productionPcs: 300, inputMt: input, deliveryMt: del, castMt: cast,
    rollingInDeliveryPct: null, rollingInCastingPct: pctTypo,
  });
  const rows = [
    e('2026-11-11', 'L5P26N11-0001', 93.9, 96.07, 97.84),
    e('2026-11-11', 'L5P26N11-0002', 439.06, 470.52, 480.38),
    e('2026-11-15', 'L5P26N15-0001', 309.36, 316.84, 332.3, 0.931),
  ];
  // A day with two entries: the sheet's own figure (row 13, AD / AE), not the average of the two.
  expect(summariseRms('d', '11 Nov', ['2026-11-11'], rows)).toMatchObject({ rollingInDeliveryPct: 94.06, rollingInCastingPct: 92.17, castMt: 578.22, deliveryMt: 566.59 });
  // 15 Nov: worked from the tonnes — the ERP's typed casting % (0.931) does not show.
  expect(summariseRms('d', '15 Nov', ['2026-11-15'], rows)).toMatchObject({ rollingInDeliveryPct: 97.64, rollingInCastingPct: 93.1 });
  // A period: tonnes added up first — (93.9 + 439.06 + 309.36) ÷ (96.07 + 470.52 + 316.84).
  expect(summariseRms('p', '11–15 Nov', ['2026-11-11', '2026-11-15'], rows)).toMatchObject({ rollingInDeliveryPct: 95.35, rollingInCastingPct: 92.51 });
  // An entry without input counts neither its input nor its delivery; no entry, no figure.
  expect(summariseRms('d', '11 Nov', ['2026-11-11'], [...rows, e('2026-11-11', 'L5P26N11-0003', null, 50, 50)]).rollingInDeliveryPct).toBe(94.06);
  expect(summariseRms('d', '24 Nov', ['2026-11-24'], rows).rollingInDeliveryPct).toBeNull();
});

test('prime yield: prime ÷ billet input, over the entries with both (the user, 25 Nov 2026)', () => {
  // 22 Nov 2026 as the ERP holds it: PRIME_MT1 328.12 of INPUT_MT1 360.10 → 91.12 % (mass yield on the actual: 92.57 %).
  const e = (date: string, prime: number | null, input: number) => ({ date, vrno: `L5P-${date}`, productionMt: 333.34, productionPcs: 383, primeMt: prime, inputMt: input });
  expect(summariseRms('d', '22 Nov', ['2026-11-22'], [e('2026-11-22', 328.12, 360.1)])).toMatchObject({ primeYieldPct: 91.12, massYieldPct: 92.57 });
  // A day without prime filled is left out of both sums, not counted as billets with no prime.
  expect(summariseRms('w', '22–23 Nov', ['2026-11-22', '2026-11-23'], [e('2026-11-22', 328.12, 360.1), e('2026-11-23', null, 465.6)]).primeYieldPct).toBe(91.12);
});
