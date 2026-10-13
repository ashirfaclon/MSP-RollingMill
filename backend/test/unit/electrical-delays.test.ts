/** HSM electrical delays: duration, the stands a fault names, and its group. */
import { describe, expect, test } from 'vitest';
import { groupOf, minutesOf, standsOf } from '../../src/modules/hsm/electrical-delays.service';

describe('electrical delays', () => {
  test('duration HH:MM:SS → minutes; empty → null', () => {
    expect(minutesOf('00:20:00')).toBe(20);
    expect(minutesOf('01:05:30')).toBe(65.5);
    expect(minutesOf('')).toBeNull();
  });
  test('the stands a fault names, as the plant writes them', () => {
    expect(standsOf('FMC DUE TO F1,F2&F5 BLOWER STOP & AGC PUMP OFF.')).toEqual(['F1', 'F2', 'F5']);
    expect(standsOf('F4&F6 DUMP DUE TO UNIT-02 HGC PUMP PRESSURE SWITCH')).toEqual(['F4', 'F6']);
    expect(standsOf('RMC DUE TO R5 DRIVE TRIPPED')).toEqual(['R5']);
    expect(standsOf('BILLET HEATER COIL BOX NO.02 BUSBAR BOLT MELT.')).toEqual([]);
    expect(standsOf('MATERIAL STUCK IN CCM-03 CONVEYOR')).toEqual([]);
  });
  test('group from the stands', () => {
    expect(groupOf(['R5'])).toBe('roughing');
    expect(groupOf(['F1', 'F3'])).toBe('finishing');
    expect(groupOf(['R1', 'F2'])).toBe('both');
    expect(groupOf([])).toBeNull();
    expect(groupOf([], 'FMC DUE TO FINISHING MILL RPM GOES DOWN DURING ROLLING')).toBe('finishing');
  });
});
