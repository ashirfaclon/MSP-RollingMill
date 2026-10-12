/**
 * HSM production comparison — the arithmetic, with no plant access.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  aggregate, buildDays, dateRange, plantDayStart, summarise, type Increment,
} from '../../src/modules/hsm/production.service';

const at = (d: string, hhmm: string) => Date.parse(`${d}T${hhmm}:00+05:30`);

describe('plant days', () => {
  test('a plant day runs 06:00 → 06:00 IST', () => {
    expect(plantDayStart('2026-09-22')).toBe(at('2026-09-22', '06:00'));
    expect(dateRange('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  });

  test('counter increases fall in the plant day they happen in; 05:59 belongs to the day before', () => {
    const inc: Increment[] = [
      { t: at('2026-09-23', '05:59'), v: 10 },   // → 22 Sep
      { t: at('2026-09-23', '06:00'), v: 20 },   // → 23 Sep
      { t: at('2026-09-23', '23:30'), v: 5 },    // → 23 Sep
    ];
    const days = buildDays(['2026-09-22', '2026-09-23'], [], inc, at('2026-09-20', '00:00'), at('2026-09-25', '00:00'), at('2026-09-25', '00:00'));
    expect(days.map((d) => d.influxMt)).toEqual([10, 25]);
    expect(days.every((d) => d.influxCoverage === 'full')).toBe(true);
  });

  test('coverage: a late start or a running day is partial; no readings is none', () => {
    const days = buildDays(
      ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-30'], [], [],
      at('2026-09-21', '12:47'), at('2026-09-30', '13:00'), at('2026-09-30', '13:00'),
    );
    expect(days.map((d) => d.influxCoverage)).toEqual(['none', 'partial', 'full', 'partial']);
    expect(days[0].influxMt).toBeNull();
    expect(days[2].influxMt).toBe(0);   // covered, produced nothing — a real zero
  });

  test('ERP entries of one day are summed; a day with none is null, not zero', () => {
    const days = buildDays(['2026-09-28', '2026-09-30'], [
      { date: '2026-09-28', mt: 11.9 }, { date: '2026-09-28', mt: 430.62 },
    ], [], null, null, at('2026-10-01', '00:00'));
    expect(days[0]).toMatchObject({ erpMt: 442.52, erpEntries: 2 });
    expect(days[1]).toMatchObject({ erpMt: null, erpEntries: 0 });
  });
});

describe('periods and variance', () => {
  const day = (date: string, erp: number | null, inf: number | null, cov: 'full' | 'partial' | 'none') =>
    ({ date, erpMt: erp, erpEntries: erp === null ? 0 : 1, influxMt: inf, influxCoverage: cov });

  test('variance counts only days with an ERP entry AND a full counter day', () => {
    const r = summarise('t', 'T', [
      day('2026-09-21', 537.31, 109.97, 'partial'),   // counter started mid-day
      day('2026-09-22', 445.05, 216.8, 'full'),
      day('2026-09-23', 562.41, 155, 'full'),
      day('2026-09-30', null, 79.1, 'partial'),       // not in ERP yet
    ]);
    expect(r).toMatchObject({ erpMt: 1544.77, influxMt: 560.87, comparedDays: 2, varianceMt: -635.66, erpDays: 3 });
    expect(r.variancePct).toBeCloseTo((-635.66 / (445.05 + 562.41)) * 100, 1);
  });

  test('weeks start Monday; months group by calendar month', () => {
    const days = dateRange('2026-09-27', '2026-10-05').map((d) => day(d, 100, 90, 'full'));
    const weeks = aggregate(days, 'week');
    expect(weeks.map((w) => [w.label, w.fromDate, w.toDate, w.days])).toEqual([
      ['Week of 21 Sep', '2026-09-27', '2026-09-27', 1],
      ['Week of 28 Sep', '2026-09-28', '2026-10-04', 7],
      ['Week of 5 Oct', '2026-10-05', '2026-10-05', 1],
    ]);
    const months = aggregate(days, 'month');
    expect(months.map((m) => [m.label, m.days, m.erpMt, m.varianceMt])).toEqual([['Sep 2026', 4, 400, -40], ['Oct 2026', 5, 500, -50]]);
  });

  test('a period with nothing to compare has no variance, not zero', () => {
    const r = summarise('t', 'T', [day('2026-09-30', null, 79.1, 'partial')]);
    expect(r).toMatchObject({ erpMt: null, comparedDays: 0, varianceMt: null, variancePct: null });
  });
});

describe('rolling plan', async () => {
  const { planDays } = await import('../../src/modules/hsm/plan.service');
  const rows = [
    { date: '2026-10-01', shift: 'Day', thicknessMm: 2.8, widthMm: 200, mt: 3 },
    { date: '2026-10-01', shift: 'Day', thicknessMm: 2.5, widthMm: 200, mt: 26 },
    { date: '2026-10-02', shift: 'Night', thicknessMm: 3.2, widthMm: 280, mt: 10 },
  ];
  test('targets add up per day and per shift as written; an unplanned day is null, not 0', () => {
    expect(planDays(['2026-10-01', '2026-10-02', '2026-10-03'], rows)).toEqual([
      { date: '2026-10-01', planMt: 29, byShift: { Day: 29 } },
      { date: '2026-10-02', planMt: 10, byShift: { Night: 10 } },
      { date: '2026-10-03', planMt: null, byShift: {} },
    ]);
  });
  test('the imported October plan: 1–14 Oct, as in the tracker of 12 Oct', () => {
    const days = planDays(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']);
    expect(days.map((d) => d.planMt)).toEqual([140, 225, 225, 225, 225, 184, 184]);
  });
});

describe('production by shift', async () => {
  const { splitByShift, shiftOf } = await import('../../src/modules/hsm/shift-split');
  const at = (s: string) => Date.parse(`${s}+05:30`);
  test('Day is 06:00–18:00 IST, Night 18:00–06:00', () => {
    expect([shiftOf(at('2026-10-07T06:00:00')), shiftOf(at('2026-10-07T17:59:00')), shiftOf(at('2026-10-07T18:00:00')), shiftOf(at('2026-10-08T05:59:00'))])
      .toEqual(['Day', 'Day', 'Night', 'Night']);
  });
  test('each plant day splits by where its ticks fell, and Day + Night equals the day exactly', () => {
    const ticks = [
      { t: at('2026-10-07T10:00:00'), v: 0.643 },                 // Day, plant day 7 Oct
      { t: at('2026-10-07T22:00:00'), v: 0.643 },                 // Night, plant day 7 Oct
      { t: at('2026-10-08T03:00:00'), v: 0.643 },                 // Night (before 06:00), still plant day 7 Oct
    ];
    const r = splitByShift(ticks, new Map([['2026-10-07', 100], ['2026-10-08', null]]));
    expect(r.get('2026-10-07')).toEqual({ Day: 33.33, Night: 66.67 });
    expect(r.get('2026-10-08')).toBeNull();
  });
});
