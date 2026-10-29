/** MID: machine sections, and visits up to the period's end in the form shapes. */
import { describe, expect, test, vi } from 'vitest';
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

describe('MID logbook forms', () => {
  test('a machine filed in the logbook replaces its report rows of that date; status = worst point; temperature = last visit', async () => {
    vi.resetModules();
    const row = (tag: string, at: string, result: Record<string, unknown>) => ({ tags: [tag], createdAt: at, result });
    const V = 'mid-logbook/vibration-reading';
    const T = 'mid-logbook/temperature-reading';
    const p = (point: string, h: number, status: string, remarks?: string) =>
      ({ date: '2026-04-21', mill: 'HSM', machine: 'PUMP-04', component: 'Pump', point, 'horizontal-mm-s-rms': h, 'vertical-mm-s-rms': 1, 'axial-mm-s-rms': 1, status, remarks });
    const rows: Record<string, unknown[]> = {
      [V]: [
        row(V, '2026-10-29T05:00:00Z', p('B1', 9, 'Good')),
        row(V, '2026-10-29T06:00:00Z', p('B1', 2.5, 'Good')), // re-filed: wins
        row(V, '2026-10-29T06:00:00Z', p('B2', 6.2, 'Un-acceptable', 'Bearing noise')),
      ],
      [T]: [
        row(T, '2026-10-29T06:00:00Z', { date: '2026-04-10', mill: 'HSM', equipment: 'ROUGHING-1', 'design-temperature-c': 90, 'max-temperature-recorded-c': 41, phase: 'R Phase', status: 'Good' }),
        row(T, '2026-10-29T06:00:00Z', { date: '2026-04-12', mill: 'HSM', equipment: 'ROUGHING-2', 'design-temperature-c': 90, 'max-temperature-recorded-c': 77, phase: 'Y Phase', status: 'Acceptable', remarks: 'Loose lug' }),
        row(T, '2026-10-29T06:00:00Z', { date: '2026-04-12', mill: 'RMD', equipment: 'MAIN INCOMER', 'design-temperature-c': 90, 'max-temperature-recorded-c': 50, status: 'Good' }),
      ],
    };
    vi.doMock('../../src/integrations/logbook/client', async (orig) => ({
      ...(await orig<object>()),
      fetchFormEntries: async (tag: string) => ({ ok: true, rows: rows[tag] ?? [] }),
    }));
    const { midReportLive } = await import('../../src/modules/mid/mid.service');
    const r = await midReportLive({} as never, 'hsm', '2026-04-30');
    const pump = r.latest!.machines.find((m) => m.machine === 'PUMP-04')!;
    expect(pump.points.map((x) => [x.point, x.horizontal])).toEqual([['B1', 2.5], ['B2', 6.2]]);
    expect(pump).toMatchObject({ status: 'Un-acceptable', diagnosis: 'Bearing noise', maxMmS: 6.2 });
    expect(r.latest!.machines).toHaveLength(21); // the report's other machines stay
    expect(r.temperature).toEqual({ date: '2026-04-12', readings: [{ equipment: 'ROUGHING-2', phase: 'Y Phase', loadMw: null, designC: 90, maxC: 77, status: 'Acceptable', remarks: 'Loose lug' }] });
    expect(r.sources.filter((s) => s.kind === 'logbook').map((s) => s.name)).toEqual(['MID Logbook → Vibration Reading', 'MID Logbook → Temperature Reading', 'MID Logbook → Temperature Reading']);
    vi.doUnmock('../../src/integrations/logbook/client');
  });
});
