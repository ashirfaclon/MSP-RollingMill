/** LSM Mill Load Log Sheet: each stand's passes, the mean load, test entries left out. */
import { describe, expect, test } from 'vitest';
import { toReading } from '../../src/modules/lsm/mill-load.service';

const r = (remarks = '', s7: number | null = 240) => toReading({
  result: {
    'date-and-time': '2026-10-23', time: '2026-10-23T12:00:00', section: 'A50X50X6', 'billet-size': '110X110MM',
    'stand-1-pass-1-amp': 120, 'stand-1-pass-2-amp': 130, 'stand-1-pass-3-amp': 140, 'stand-1-pass-4-amp': 150,
    'stand-2-pass-5-amp': 200, 'stand-7-pass-10-amp': s7, 'stand-3-pass-6-amp': 210, remarks,
  },
});

describe('LSM mill load log sheet', () => {
  test('a test entry is left out', () => {
    expect(r('Test entry')).toBeNull();
  });

  test('passes in stand then pass order; mean of the passes filled', () => {
    const e = r()!;
    expect(e.passes.map((p) => `${p.stand}/${p.pass}`)).toEqual(['1/1', '1/2', '1/3', '1/4', '2/5', '3/6', '7/10']);
    expect(e.meanA).toBe(170);
    expect(r('', null)!.meanA).toBe(158.33);
    expect(e).toMatchObject({ date: '2026-10-23', section: 'A50X50X6', billetSize: '110X110MM' });
  });
});
