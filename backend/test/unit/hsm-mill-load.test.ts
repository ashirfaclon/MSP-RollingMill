/** HSM Mill Load Log Sheet: stand → group, test entries left out, each stand's latest reading. */
import { describe, expect, test } from 'vitest';
import { latestByStand, standOf, toEntry } from '../../src/modules/hsm/mill-load.service';

const e = (date: string, time: string, stand: string, load: number, de: number, nde: number, remarks = '') =>
  toEntry({ result: { date, time: `${date}T${time}:00`, shift: 'DAY', 'stand-name': stand, 'load-in-amp': load, 'dc-motor-de-temp': de, 'dc-motor-nde-temp': nde, remarks } });

describe('HSM mill load log sheet', () => {
  test('the stand name gives the group: RM → roughing, FM → finishing', () => {
    expect(standOf('RM 4')).toEqual({ stand: 'RM 4', group: 'roughing' });
    expect(standOf('fm-02')).toEqual({ stand: 'FM 2', group: 'finishing' });
    expect(standOf('R1')).toEqual({ stand: 'RM 1', group: 'roughing' });
    expect(standOf('Billet heater')).toEqual({ stand: 'Billet heater', group: null });
  });

  test('a test entry is left out; the reading keeps load and DE / NDE temperature', () => {
    expect(e('2026-10-21', '12:46', 'RM 4', 23, 45, 534, 'Test Entry')).toBeNull();
    expect(e('2026-10-21', '12:46', 'RM 4', 410, 52, 55)).toMatchObject({ stand: 'RM 4', group: 'roughing', loadA: 410, deTempC: 52, ndeTempC: 55 });
  });

  test('each stand\'s latest reading by Date, then time', () => {
    const l = latestByStand([
      e('2026-10-20', '20:00', 'RM 4', 400, 50, 51)!, e('2026-10-21', '08:00', 'RM 4', 420, 53, 54)!,
      e('2026-10-21', '09:00', 'FM 1', 300, 48, 49)!, e('2026-10-21', '07:00', 'RM 4', 999, 99, 99)!,
    ]);
    expect(l.map((x) => [x.stand, x.loadA])).toEqual([['FM 1', 300], ['RM 4', 420]]);
  });
});
