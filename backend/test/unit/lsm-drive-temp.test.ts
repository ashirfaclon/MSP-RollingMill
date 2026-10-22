/** LSM Mechanical → Drive Temp: mill day of the date-time, test entries left out, each drive's latest. */
import { describe, expect, test } from 'vitest';
import { latestByDrive, millDayOf, toReading } from '../../src/modules/lsm/drive-temp.service';

const r = (at: string, drive: string, level: number, remarks = '') => toReading({
  result: {
    'date-time': at, shift: 'DAY', 'drive-name': drive,
    'flywheel-bearing-de-side-temp-c': 52, 'flywheel-bearing-nde-side-temp-c': 55,
    'reduction-gearbox-bearingtemp-c-de': 48, 'reduction-gearbox-bearingtemp-c-nde': 49,
    'pinion-gearbox-temp-c-de': 50, 'pinion-gearbox-temp-c-nde': 51,
    'oil-pressure-kg-cm2': 2.5, 'oil-level-inches': level, remarks,
  },
});

describe('LSM drive temp form', () => {
  test('a reading before 09:00 belongs to the previous mill day', () => {
    expect(millDayOf('2026-10-22T02:00:00')).toBe('2026-10-21');
    expect(millDayOf('2026-10-22T09:00:00')).toBe('2026-10-22');
    expect(millDayOf('2026-11-01T08:59:00')).toBe('2026-10-31');
  });

  test('a test entry is left out; a reading keeps its bearings and oil', () => {
    expect(r('2026-10-21T18:45:00', 'DRIVE01', 12, 'Test Entry')).toBeNull();
    expect(r('2026-10-21T18:45:00', 'DRIVE01', 12)).toMatchObject({ date: '2026-10-21', drive: 'DRIVE01', flywheelNdeC: 55, oilPressure: 2.5, oilLevelIn: 12 });
  });

  test('each drive\'s latest reading, drives in natural order', () => {
    const l = latestByDrive([r('2026-10-21T10:00:00', 'DRIVE10', 9)!, r('2026-10-21T10:00:00', 'DRIVE02', 11)!, r('2026-10-21T20:00:00', 'DRIVE02', 10)!]);
    expect(l.map((x) => [x.drive, x.oilLevelIn])).toEqual([['DRIVE02', 10], ['DRIVE10', 9]]);
  });
});
