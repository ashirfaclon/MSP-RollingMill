/** What was rolled, from the finished receipts (the user, 25 Nov 2026): every mill's names, the rolling, the dates. */
import { describe, expect, test } from 'vitest';
import { sectionsRolled } from '../../src/shared/sections';
import { stripLabelOf } from '../../src/modules/hsm/erp-kpis.service';
import { barLabelOf } from '../../src/modules/rmd/stock.service';
import { sectionLabelOf } from '../../src/modules/lsm/stock.service';

describe('names as Finished stock by size', () => {
  test('HSM strip: width × thickness, defective marked', () => {
    expect(stripLabelOf('MS STRIP (234 - 236 X 2.80MM) Direct')).toBe('234–236 × 2.80');
    expect(stripLabelOf('MS STRIP(234-236 X 2.50MM)')).toBe('234–236 × 2.50');
    expect(stripLabelOf('MS STRIP (184-186X1.6MM) DEFECTIVE')).toBe('184–186 × 1.60 · defective');
  });
  test('RMD bar: size in mm; miss roll not shown', () => {
    expect(barLabelOf('MS PREMIUM TMT BARS 12 MM')).toBe('12 mm');
    expect(barLabelOf('MS TMT BAR 10 MM SL')).toBe('10 mm');
    expect(barLabelOf('MISS ROLL TMT BAR 20 MM')).toBeNull();
    expect(barLabelOf('MS ROUND BAR 25 MM')).toBe('Round 25 mm');
  });
  test('RMS section: type and size', () => {
    expect(sectionLabelOf('MS CHANNEL 150 MM 6 mtr', false)?.label).toBe('MC 150');
    expect(sectionLabelOf('MS BEAM 250 MM 6 mtr', false)?.label).toBe('MB 250');
  });
});

describe('summed by name, for the dates and the rolling', () => {
  // HSM 14 Nov 2026 as the ERP holds it: Online 2.80 8.47, Offline 2.80 1.21.
  const receipts = [
    { date: '2026-11-14', item: 'a', name: 'MS STRIP (198 - 200 X 2.00MM) Direct', mt: 81.64, mode: 'online' as const },
    { date: '2026-11-14', item: 'b', name: 'MS STRIP (198 - 200 X 2.80MM) Direct', mt: 8.47, mode: 'online' as const },
    { date: '2026-11-14', item: 'b', name: 'MS STRIP (198 - 200 X 2.80MM) Direct', mt: 1.21, mode: 'offline' as const },
    { date: '2026-11-15', item: 'a', name: 'MS STRIP (198 - 200 X 2.00MM) Direct', mt: 33.87, mode: 'online' as const },
  ];
  test('both rollings, largest first', () => {
    expect(sectionsRolled(['2026-11-14'], receipts, stripLabelOf)).toEqual([{ label: '198–200 × 2.00', mt: 81.64 }, { label: '198–200 × 2.80', mt: 9.68 }]);
  });
  test('one rolling', () => {
    expect(sectionsRolled(['2026-11-14'], receipts, stripLabelOf, 'offline')).toEqual([{ label: '198–200 × 2.80', mt: 1.21 }]);
  });
  test('over several dates', () => {
    expect(sectionsRolled(['2026-11-14', '2026-11-15'], receipts, stripLabelOf, 'online')[0]).toEqual({ label: '198–200 × 2.00', mt: 115.51 });
  });
});
