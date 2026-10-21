/** RMD Mill MPS trend bucket; SMS lollipop samples: RMD only, test entries left out. */
import { describe, expect, test } from 'vitest';
import { bucketMinutesOf } from '../../src/modules/rmd/mill-speed.service';
import { toSample } from '../../src/modules/rmd/chemistry.service';

const H = 3_600_000;
const s = (mill: string, remark = '') => toSample({
  createdAt: '2026-10-21T10:00:00Z',
  result: { date: '2026-10-21', 'furnace-number': 'F1B', ccm: '2', mill, section: '100X100', 'c-18': 0.21, 'mn-19': 0.62, 's-20': 0.031, 'p-21': 0.028, 'si-22': 0.18, remark },
});

describe('RMD Mill MPS', () => {
  test('about 150 trend buckets over the period, in 5-minute steps', () => {
    expect(bucketMinutesOf(0, 24 * H)).toBe(10);
    expect(bucketMinutesOf(0, 7 * 24 * H)).toBe(70);
    expect(bucketMinutesOf(0, H)).toBe(5);
  });
});

describe('RMD chemical composition', () => {
  test('only RMD samples; a test entry is left out', () => {
    expect(s('RMS')).toBeNull();
    expect(s('RMD', 'TEST TEST TEST')).toBeNull();
    expect(s('rmd')).toMatchObject({ date: '2026-10-21', furnace: 'F1B', ccm: '2', c: 0.21, mn: 0.62, s: 0.031, p: 0.028, si: 0.18 });
  });
});
