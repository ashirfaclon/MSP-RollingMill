/**
 * Running hours from billet discharges, and the running rate built on them — pure, no plant access.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { RUN_GAP_MS, runsOf, summariseRate, type RateDay } from '../../src/modules/hsm/running-rate.service';

const at = (s: string) => Date.parse(`${s}+05:30`);
const ticks = (...ts: string[]) => ts.map((s) => ({ t: at(s), v: 1 }));
const hours = (r: { start: number; end: number }) => (r.end - r.start) / 3_600_000;

test('billets up to 10 min apart are one run; a longer gap is a stop', () => {
  const runs = runsOf(ticks(
    '2026-09-25T10:00:00', '2026-09-25T10:05:00', '2026-09-25T10:15:00',   // 5 + 10 min → one run
    '2026-09-25T10:25:01',                                                 // 10 min 1 s later → a new run
    '2026-09-25T10:30:01',
  ));
  expect(RUN_GAP_MS).toBe(10 * 60_000);
  expect(runs.map((r) => [r.billets, hours(r)])).toEqual([[3, 0.25], [2, 5 / 60]]);
});

test('a lone billet adds no running time', () => {
  const runs = runsOf(ticks('2026-09-25T10:00:00', '2026-09-25T12:00:00'));
  expect(runs.map(hours)).toEqual([0, 0]);
});

test('a run crossing 06:00 is cut there, each part in its own plant day', () => {
  const runs = runsOf(ticks('2026-09-26T05:50:00', '2026-09-26T05:58:00', '2026-09-26T06:04:00'));
  expect(runs.map((r) => [r.date, hours(r) * 60, r.billets])).toEqual([
    ['2026-09-25', 10, 2],
    ['2026-09-26', 4, 1],
  ]);
});

test('a period rate is total MT ÷ total hours, not the average of daily rates', () => {
  const day = (date: string, mt: number, h: number): RateDay => ({
    date, elapsedH: 24, runH: h, runs: 1, influxMt: mt, rateTph: mt / h,
    erpMt: null, erpRunH: null, erpDelayH: null, erpRateTph: null,
  });
  const p = summariseRate('w', 'Week', [day('2026-09-22', 200, 10), day('2026-09-23', 20, 2)]);
  // (200 + 20) ÷ (10 + 2) = 18.33, not (20 + 10) ÷ 2 = 15.
  expect(p.rateTph).toBe(18.33);
  expect(p.erpRateTph).toBeNull();
});
