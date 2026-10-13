/** LSM stock by section: the section from the item's name, lengths and defective summed into it. */
import { describe, expect, test } from 'vitest';
import { sectionOf, stockBySection } from '../../src/modules/lsm/stock.service';

describe('LSM section from the item name', () => {
  test.each([
    ['MS ANGLE 65X8 12 mtr', 'Angle 65×8'],
    ['M.S. ANGLE 100 X 12   12 mtr', 'Angle 100×12'],
    ['M.S.ANGLE 40 X 5 6 MTR', 'Angle 40×5'],
    ['ms angle 65x5  defective', 'Angle 65×5'],
    ['MS Channel 75X40 6 mtr', 'Channel 75×40'],
    ['MS CHANNEL 100 X 50 MM Sp.Length', 'Channel 100×50'],
    ['MS CHANNEL 125MM 6Mtr LIGHT', 'Channel 125'],
    ['MS BEAM 125 MM  DEFECTIVE', 'Beam 125'],
    ['H BEAM 100X116 MM  6 mtrs', 'H Beam 100×116'],
    ['MS ROUND BAR 40 MM   DEFECTIVE', 'Round 40'],
    ['MS ROUND 40 MM(9 MTR)', 'Round 40'],
  ])('%s → %s', (name, label) => expect(sectionOf(name)?.label).toBe(label));
  test('no section → null', () => expect(sectionOf('MISS ROLL STRUCTURE')).toBeNull());
});

describe('LSM stock by section', () => {
  const cache = {
    items: { A6: 'MS ANGLE 50 X 6 6 mtr', A12: 'MS ANGLE 50 X 6 12 mtr', AD: 'MS ANGLE 50X6  DEFECTIVE', C: 'MS Channel 75X40 6 mtr', Z: 'MS ANGLE 90 X8 6 mtr', R: 'MS ROUND 32 MM 6 mtr', B: 'MS BEAM 125 MM 12 mtr' },
    moves: [
      { date: '2026-10-01', item: 'A6', netMt: 500 }, { date: '2026-10-12', item: 'A6', netMt: 27.89 },
      { date: '2026-10-05', item: 'A12', netMt: 83.43 }, { date: '2026-10-05', item: 'AD', netMt: 7.009 },
      { date: '2026-10-05', item: 'C', netMt: 299.7 }, { date: '2026-10-05', item: 'Z', netMt: 0 },
      { date: '2026-10-14', item: 'C', netMt: -50 },
      { date: '2026-10-05', item: 'R', netMt: 65.17 }, { date: '2026-10-05', item: 'B', netMt: 164.5 },
    ],
  };
  test('every finished item under LS: the plant\'s sections first in their order, then the rest; 0 left out; up to the date', () => {
    const s = stockBySection(cache, '2026-10-13');
    expect(s.map((x) => [x.label, x.stockMt])).toEqual([['A 50×50×6', 618.33], ['MC 75×40', 299.7], ['MB 125×70', 164.5], ['Round 32', 65.17]]);
    expect(s[0].items.map((i) => i.stockMt)).toEqual([527.89, 83.43, 7.01]);
  });

  test('RMS (no plant list): sections by type and size, the same names', () => {
    const rms = {
      items: { C2: 'MS CHANNEL 200 MM 6 mtr', B2: 'MS BEAM 200 MM 12 mtr', A13: 'M.S. ANGLE 130 X 10  12 mtr ', H: 'H  BEAM 152MM  12 mtrs' },
      moves: [
        { date: '2026-10-01', item: 'C2', netMt: 512.6 }, { date: '2026-10-01', item: 'B2', netMt: 233.95 },
        { date: '2026-10-01', item: 'A13', netMt: 83.8 }, { date: '2026-10-01', item: 'H', netMt: 1.61 },
      ],
    };
    expect(stockBySection(rms, '2026-10-13', false).map((x) => [x.label, x.stockMt]))
      .toEqual([['A 130×130×10', 83.8], ['MC 200', 512.6], ['MB 200', 233.95], ['H Beam 152', 1.61]]);
  });
});
