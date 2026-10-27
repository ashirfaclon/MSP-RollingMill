/** HSM costing: a period gets the sheet's figures only when every month it touches has a sheet. */
import { describe, expect, test } from 'vitest';
import { hsmCosting, monthsOf } from '../../src/modules/hsm/costing/costing.service';

describe('HSM costing', () => {
  test('months of a period', () => {
    expect(monthsOf('2026-09-15', '2026-10-02')).toEqual(['2026-09', '2026-10']);
    expect(monthsOf('2026-12-20', '2027-01-05')).toEqual(['2026-12', '2027-01']);
    expect(monthsOf('2026-09-01', '2026-09-30')).toEqual(['2026-09']);
  });

  test('September: the sheet\'s figures', () => {
    const r = hsmCosting('2026-09-01', '2026-09-30');
    expect(r.period).toMatchObject({ productionMt: 5292.1, conversionPerMt: 2906.29, tariffPerKwh: 5.75 });
    expect(r.period!.otherConversionPerMt).toBe(1542.69);
    expect(r.period!.powerPerMt).toBe(665.32);
    expect(r.period!.materialLossRs).toBe(3695346);
  });

  test('a period touching a month without a sheet has no figures', () => {
    expect(hsmCosting('2026-09-25', '2026-10-05').period).toBeNull();
    expect(hsmCosting('2026-10-01', '2026-10-08').sheets).toEqual([]);
  });
});
