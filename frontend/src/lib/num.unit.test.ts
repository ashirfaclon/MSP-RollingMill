import { describe, expect, test } from 'vitest';
import { axisFloor } from './num';

describe('axisFloor', () => {
  test('0 while nothing is below zero; else the round step under the lowest value', () => {
    expect(axisFloor([12, 40, null, 3])).toBe(0);
    expect(axisFloor([])).toBe(0);
    expect(axisFloor([12, -4, null])).toBe(-10);
    expect(axisFloor([-23.5, 8])).toBe(-30);
    expect(axisFloor([-4], 5)).toBe(-5);
  });
});
