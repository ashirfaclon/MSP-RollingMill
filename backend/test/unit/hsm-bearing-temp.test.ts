/**
 * HSM Mechanical → Bearing Temperature Details (the user, 25 Nov 2026): one round of the whole mill per entry —
 * gearbox bearings D / ND side per stand, oil per lubrication tank; test entries left out; each unit's latest.
 */
import { describe, expect, test } from 'vitest';
import { latestOf, toBearingEntry } from '../../src/modules/hsm/bearing-temp.service';
import { LIMIT_DEFAULTS } from '../../src/config/limits';

/** The field names exactly as the form's first (test) entry sent them, 25 Nov 2026. */
const result = (over: Record<string, unknown> = {}) => ({
  date: '2026-11-25', shift: 'Day', time: '21:12:00', section: '190 MM',
  'rm-stand-1-d-side-c': 41, 'rm-stand-1-nd-side-c': 39, 'rm-stand-2-d-side-c': 44, 'rm-stand-2-nd-side-c': 40,
  'rm-stand-3-d-side-c': 45, 'rm-stand-3-nd-side-c': 42, 'rm-stand-4-d-side-c': 47, 'rm-stand-4-nd-side-c': 43,
  've-1-n-os-d-side-c': 38, 've-1-n-os-nd-side-c': 37, 've-1-os-d-side-c': 39, 've-1-os-nd-side-c': 36,
  'rm-stand-5-d-side-c': 50, 'rm-stand-5-nd-side-c': 46,
  'fm-1-d-side-c': 52, 'fm-1-nd-side-c': 48, 'fm-2-d-side-c': 53, 'fm-2-nd-side-c': 49, 'fm-3-d-side-c': 55, 'fm-3-nd-side-c': 50,
  'fm-4-d-side-c': 56, 'fm-4-nd-side-c': 51, 'fm-5-d-side-c': 58, 'fm-5-nd-side-c': 52, 'fm-6-d-side-c': 61, 'fm-6-nd-side-c': 57,
  'lubrication-tank-1-c': 44, 'lubrication-tank-2-c': 46, 'lubrication-tank-3-c': 49, 'lubrication-tank-4-c': 51,
  'average-d-side-c': 1, 'average-nd-side-c': 1, 'average-oil-temperature-c': 1, remarks: '',
  ...over,
});

describe('one entry', () => {
  test('every bearing in the form\'s order, grouped; the four tanks with their stands', () => {
    const e = toBearingEntry({ result: result() })!;
    expect(e.bearings.map((b) => b.unit)).toEqual(['RM 1', 'RM 2', 'RM 3', 'RM 4', 'VE 1 · N-OS', 'VE 1 · OS', 'RM 5', 'FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6']);
    expect(e.bearings.find((b) => b.unit === 'VE 1 · OS')).toEqual({ unit: 'VE 1 · OS', group: 'roughing', dC: 39, ndC: 36 });
    expect(e.bearings.find((b) => b.unit === 'FM 6')).toEqual({ unit: 'FM 6', group: 'finishing', dC: 61, ndC: 57 });
    expect(e.tanks).toEqual([
      { tank: 1, stands: 'R1 & R2', group: 'roughing', tempC: 44 }, { tank: 2, stands: 'R3, R4 & R5', group: 'roughing', tempC: 46 },
      { tank: 3, stands: 'F1, F2 & F3', group: 'finishing', tempC: 49 }, { tank: 4, stands: 'F4, F5 & F6', group: 'finishing', tempC: 51 },
    ]);
    expect(e).toMatchObject({ date: '2026-11-25', time: '21:12:00', shift: 'Day', section: '190 MM' });
  });

  test('a test entry is left out; a blank reading stays blank', () => {
    expect(toBearingEntry({ result: result({ remarks: 'Test Entry' }) })).toBeNull();
    const e = toBearingEntry({ result: result({ 'fm-2-nd-side-c': '', 'lubrication-tank-3-c': null, section: '' }) })!;
    expect(e.bearings.find((b) => b.unit === 'FM 2')!.ndC).toBeNull();
    expect(e.tanks[2].tempC).toBeNull();
    expect(e.section).toBeNull();
  });
});

describe('latest per unit', () => {
  test('a unit left blank in the last round keeps its reading from the round before', () => {
    const a = toBearingEntry({ result: result({ time: '09:00:00' }) })!;
    const b = toBearingEntry({ result: result({ time: '15:00:00', 'fm-1-d-side-c': '', 'fm-1-nd-side-c': '', 'fm-6-d-side-c': 63, 'lubrication-tank-4-c': '' }) })!;
    const l = latestOf([a, b]);
    expect(l.bearings.find((x) => x.unit === 'FM 1')).toMatchObject({ dC: 52, time: '09:00:00' });
    expect(l.bearings.find((x) => x.unit === 'FM 6')).toMatchObject({ dC: 63, time: '15:00:00', section: '190 MM' });
    expect(l.tanks.find((t) => t.tank === 4)).toMatchObject({ tempC: 51, time: '09:00:00' });
    expect(l.bearings).toHaveLength(13);
  });
});

test('limits: the form\'s own range, below 65 °C, for the bearings and the oil', () => {
  const hsm = LIMIT_DEFAULTS.hsm;
  expect(hsm.find((d) => d.id === 'gearbox-bearing-temp')).toMatchObject({ max: 65, approval: 'plant', reading: 'HSM Mechanical → Bearing Temperature Details' });
  expect(hsm.find((d) => d.id === 'oil-temp')).toMatchObject({ max: 65, approval: 'plant', group: 'Oil' });
});
