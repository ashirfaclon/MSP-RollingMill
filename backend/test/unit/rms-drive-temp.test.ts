import { describe, expect, test } from 'vitest';
import { rmsBearingOf, rmsLatestByDrive, rmsMillDayOf, toRmsReading } from '../../src/modules/rms/drive-temp.service';

describe('RMS Drive Temp form', () => {
  test.each([
    ['rg1-input-inside-temp', 'Reduction gearbox 1', 'Input inside'],
    ['rg2-output-outside-temp', 'Reduction gearbox 2', 'Output outside'],
    ['pinion-center-inside-temp', 'Pinion', 'Centre inside'],
    ['pinion-bottom-outside-temp', 'Pinion', 'Bottom outside'],
    ['flywheel-output-temp', 'Flywheel', 'Output'],
  ])('%s → %s · %s', (field, component, point) => expect(rmsBearingOf(field)).toEqual({ component, point }));
  test('not a bearing', () => {
    for (const f of ['oil-temp', 'oil-pressure-level', 'drive-name', 'shift']) expect(rmsBearingOf(f)).toBeNull();
  });
  test('mill day starts 09:30 IST', () => {
    expect(rmsMillDayOf('2026-10-30T09:29:00')).toBe('2026-10-29');
    expect(rmsMillDayOf('2026-10-30T09:30:00')).toBe('2026-10-30');
    expect(rmsMillDayOf('2026-10-30T11:00:00')).toBe('2026-10-30');
  });
  test('an entry as filled (30 Oct 2026, DRIVE 01)', () => {
    const r = toRmsReading({
      result: {
        'date-time': '2026-10-30T11:00:00', shift: 'DAY', 'drive-name': 'DRIVE 01',
        'rg1-input-inside-temp': 50.4, 'rg1-input-outside-temp': 63.4, 'pinion-top-inside-temp': 43.2,
        'flywheel-input-temp': 44.1, 'oil-pressure-level': 0.8, 'oil-temp': 38.1,
      },
    } as never)!;
    expect(r.date).toBe('2026-10-30');
    expect(r.drive).toBe('DRIVE 01');
    expect(r.bearings).toHaveLength(4);
    expect(Math.max(...r.bearings.map((b) => b.valueC))).toBe(63.4);
    expect(r.oilTempC).toBe(38.1);
    expect(r.oilPressure).toBe(0.8);
  });
  test('a "test" entry is not a reading', () => {
    expect(toRmsReading({ result: { 'date-time': '2026-10-30T11:00:00', remarks: 'test' } } as never)).toBeNull();
  });
  test('latest per drive', () => {
    const e = (drive: string, at: string) => ({ date: at.slice(0, 10), at, shift: '', drive, bearings: [], oilTempC: null, oilPressure: null });
    expect(rmsLatestByDrive([e('DRIVE 02', '2026-10-30T11:00'), e('DRIVE 01', '2026-10-30T10:00'), e('DRIVE 01', '2026-10-30T12:00')]).map((x) => `${x.drive} ${x.at}`))
      .toEqual(['DRIVE 01 2026-10-30T12:00', 'DRIVE 02 2026-10-30T11:00']);
  });
});
