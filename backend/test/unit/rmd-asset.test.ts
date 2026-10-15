/** RMD asset health: the bearing and oil-tank form fields, read as equipment · point. */
import { describe, expect, test } from 'vitest';
import { bearingGroup, bearingOf, oilGroup, type RmdFormEntry } from '../../src/modules/rmd/asset.service';

describe('RMD bearing fields', () => {
  test.each([
    ['20-inch-r-stand', 'flywheel-d-side-c', '20" R stand', 'Flywheel D side'],
    ['intermill', 'pinion-gear-nd-side-c', 'Intermill', 'Pinion gear ND side'],
    ['old-continuous-stand', 'old-c-stand-3-reduction-gear-d-side-c', 'OC stand 3', 'Reduction gear D side'],
    ['new-continuous-stand', 'new-c-stand-8-pinion-gear-nd-side-c', 'NC stand 8', 'Pinion gear ND side'],
  ])('%s · %s → %s · %s', (form, field, equipment, point) => expect(bearingOf(form, field)).toEqual({ equipment, point }));
  test('not a bearing field', () => {
    expect(bearingOf('intermill', 'size-1-mm')).toBeNull();
    expect(bearingOf('oil-tank-level', '20-r-stand')).toBeNull();
  });
});

const e = (form: string, time: string, res: Record<string, unknown>): RmdFormEntry => ({ form, date: time.slice(0, 10), time, createdMs: 0, res });

describe('RMD bearing and oil groups', () => {
  const entries = [
    e('20-inch-r-stand', '2026-10-15T08:00:00', { 'flywheel-d-side-c': 50, 'pinion-gear-d-side-c': 61 }),
    e('20-inch-r-stand', '2026-10-15T20:00:00', { 'flywheel-d-side-c': 55, 'pinion-gear-d-side-c': 58 }),
    e('16-inch-r-stand', '2026-10-15T09:00:00', { 'reduction-gear-nd-side-c': 63 }),
    e('intermill', '2026-10-15T09:00:00', { 'flywheel-d-side-c': 90 }),
    e('oil-tank-level', '2026-10-15', { '20-r-stand': 14, '16-r-stand': 11.5, intermill: 9 }),
    e('oil-tank-temperature', '2026-10-15', { '20-r-stand-c': 41, '16-r-stand-c': 43 }),
  ];
  test('roughing: each form\'s latest entry; the hottest of them; the trend of each entry\'s hottest', () => {
    const g = bearingGroup(entries, 'roughing');
    expect(g.max).toMatchObject({ equipment: '16" R stand', point: 'Reduction gear ND side', value: 63 });
    expect(g.latest.map((r) => r.value)).toEqual([63, 55, 58]);   // 16" first; 20" from its 20:00 entry
    expect(g.trend.map((t) => t.maxC)).toEqual([61, 63, 58]);
  });
  test('oil: roughing tanks only; the lowest level', () => {
    const o = oilGroup(entries, 'roughing');
    expect(o.level.map((r) => [r.equipment, r.value])).toEqual([['20" R stand', 14], ['16" R stand', 11.5]]);
    expect(o.minLevel).toMatchObject({ equipment: '16" R stand', value: 11.5 });
    expect(o.temperature.map((r) => r.value)).toEqual([41, 43]);
  });
});
