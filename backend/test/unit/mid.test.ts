/** MID: machine sections, and visits up to the period's end in the form shapes. */
import { describe, expect, test } from 'vitest';
import { sectionOf } from '../../src/modules/mid/sections';
import { midReport } from '../../src/modules/mid/mid.service';

describe('MID sections', () => {
  test('RMD as the plant listed it; HSM by stand; LSM / RMS none', () => {
    expect(sectionOf('rmd', 'ROUGHING 1')).toBe('roughing');
    expect(sectionOf('rmd', 'DC MOTOR NO.3 OLD')).toBe('route');
    expect(sectionOf('rmd', 'NEW DC 02')).toBe('route');
    expect(sectionOf('rmd', 'TAIL BREAKER-01 NEW')).toBe('finishing');
    expect(sectionOf('rmd', 'COLD WATER PUMP 02 OLD')).toBe('auxiliary');
    expect(sectionOf('hsm', 'FINISHING-03')).toBe('finishing');
    expect(sectionOf('hsm', 'VERTICAL PINCH ROLL')).toBeNull();
    expect(sectionOf('lsm', 'SLP NO. 1')).toBeNull();
  });
});

describe('MID report', () => {
  const readings = [
    { date: '2026-04-21', mill: 'hsm', machine: 'PUMP-04', part: null, component: 'Pump', point: 'B1', horizontal: 1.9, vertical: 1.5, axial: 1.7 },
    { date: '2026-04-21', mill: 'hsm', machine: 'PUMP-04', part: null, component: 'Pump', point: 'B3', horizontal: 4.1, vertical: 3.3, axial: null },
    { date: '2026-05-20', mill: 'hsm', machine: 'PUMP-04', part: null, component: 'Pump', point: 'B1', horizontal: 2.0, vertical: 1.4, axial: 1.1 },
  ];
  const conditions = [{ date: '2026-04-21', mill: 'hsm', machine: 'PUMP-04', status: 'Acceptable', diagnosis: 'Misalignment' }];

  test('visits up to the period end; the latest; the highest reading of a machine', () => {
    const r = midReport('hsm', '2026-05-01', readings, conditions);
    expect(r.visits.map((v) => v.date)).toEqual(['2026-04-21']);
    expect(r.latest!.machines[0]).toMatchObject({ machine: 'PUMP-04', section: 'auxiliary', status: 'Acceptable', maxMmS: 4.1 });
    expect(midReport('hsm', '2026-05-31', readings, conditions).latest!.date).toBe('2026-05-20');
    expect(midReport('hsm', '2026-04-01', readings, conditions).latest).toBeNull();
  });

  test('the converted reports: four mills, every machine once per visit', () => {
    expect(midReport('hsm', '2026-10-27').latest!.machines).toHaveLength(21);
    expect(midReport('rmd', '2026-10-27').latest!.machines).toHaveLength(26);
    expect(midReport('lsm', '2026-10-27').latest!.machines.find((m) => m.machine === 'MILL PUMP NO. 4')!.status).toBe('Un-acceptable');
    expect(midReport('rms', '2026-10-27').latest!.date).toBe('2026-01-10');
  });
});
