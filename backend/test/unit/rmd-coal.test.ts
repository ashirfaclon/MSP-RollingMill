/** RMD coal, Offline entries only (the user, 24 Nov 2026): kg per MT of Prime + SL, as the ERP's COAL_CONSUMPTION_KGMT. */
import { describe, expect, test } from 'vitest';
import { coal } from '../../src/modules/rmd/production.service';
import type { RmdLogRow } from '../../src/integrations/erp/cache';

// 21–22 Nov 2026 as the ERP holds them.
const row = (date: string, mode: 'online' | 'offline', psl: number, total: number, kgmt: number) =>
  ({ date, vrno: date + mode, mode, v: { PRODUCT_PRIME_SLENGTH_MT: psl, TOTAL_COAL_CONSUMPTION: total, COAL_CONSUMPTION_KGMT: kgmt } }) as unknown as RmdLogRow;
const ROWS = [
  row('2026-11-21', 'offline', 197.63, 18.5, 93.609), row('2026-11-21', 'online', 283.04, 0, 0),
  row('2026-11-22', 'offline', 140.39, 13.2, 94.024), row('2026-11-22', 'online', 316.85, 0, 0),
];

describe('RMD coal', () => {
  test('one Offline entry: the ERP\'s own kg/MT', () => {
    expect(coal([ROWS[2]])).toEqual({ coalMt: 13.2, coalKgPerMt: 94.02 });
  });
  test('several: Σ coal ÷ Σ Prime + SL of the Offline entries; Online entries do not count', () => {
    // (18.5 + 13.2) × 1000 ÷ (197.63 + 140.39) = 93.78.
    expect(coal(ROWS)).toEqual({ coalMt: 31.7, coalKgPerMt: 93.78 });
  });
  test('only Online entries: none', () => {
    expect(coal([ROWS[1], ROWS[3]])).toEqual({ coalMt: null, coalKgPerMt: null });
  });
  test('an entry with kg/MT but no total: the total from kg/MT × Prime + SL', () => {
    const r = row('2026-11-22', 'offline', 140.39, 0, 94.024);
    expect(coal([r]).coalKgPerMt).toBe(94.02);
  });
});
