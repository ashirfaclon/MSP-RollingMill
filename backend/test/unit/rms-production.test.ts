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
