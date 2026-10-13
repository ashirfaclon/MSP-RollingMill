/** RMS production from the ERP log sheet: a repeated identical entry counts once. */
import { describe, expect, test } from 'vitest';
import { distinctEntries, summariseRms } from '../../src/modules/rms/production.service';

// 1–6 Oct 2026 as the ERP holds them.
const ROWS = [
  { date: '2026-10-01', vrno: 'L5P26O01-0001', productionMt: 577.45, productionPcs: 694, inputPcs: 700 },
  { date: '2026-10-01', vrno: 'L5P26O01-0002', productionMt: 577.45, productionPcs: 694, inputPcs: 700 },
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
  test('a date with no entry is null', () => {
    expect(summariseRms('d', '2 Oct', ['2026-10-02'], distinctEntries(ROWS))).toMatchObject({ entryDays: 0, productionMt: null });
  });
});
