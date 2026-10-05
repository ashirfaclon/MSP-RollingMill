/**
 * ERP KPI arithmetic (log sheet, sizes, orders) and the live stand-group rule — no plant
 * access. Plus validation of every new HSM route.
 */
import { test, expect } from '@playwright/test';
import { buildLogDays, financialYear, parseStripSpec, summariseLog } from '@/server/hsm/erpKpis';
import { groupState, type StandNow } from '@/server/hsm/live';
import type { ErpProductionRow } from '@/server/erp/cache';
import { GET as logsheet } from '@/app/api/hsm/logsheet/route';
import { GET as sizes } from '@/app/api/hsm/sizes/route';
import { GET as orders } from '@/app/api/hsm/orders/route';
import { GET as billets } from '@/app/api/hsm/billets/route';
import { GET as stands } from '@/app/api/hsm/stands/route';

/** One log-sheet voucher that balances: 100 in = 95 out + 1 + 2 + 1.5 + 0.5; 95 = 90 + 3 + 2. */
const voucher = (date: string, over: Partial<NonNullable<ErpProductionRow['v']>> = {}): ErpProductionRow => {
  const v = {
    INPUT_MT: 100, INPUT_PCS: 130, PRODUCTION_MT: 95, PRODUCTION_PCS: 128,
    PRIME_MT: 90, DEFECTIVE_MT: 3, ROLLING_DEFECT_MT: 2,
    BLOSS_MT: 1, ENDCUT_MT: 2, MISSROLL_MT: 1.5, REJECT_MT: 0.5, ...over,
  };
  return { date, vrno: `L6P-${date}-${Math.random()}`, mt: v.PRODUCTION_MT, v };
};

test.describe('log sheet', () => {
  test('a day sums its vouchers and passes all three checks', () => {
    const [d] = buildLogDays(['2026-09-22'], [voucher('2026-09-22'), voucher('2026-09-22')], new Map([['2026-09-22', 190]]));
    expect(d).toMatchObject({
      entries: 2, inputMt: 200, productionMt: 190, massDiffMt: 10, yieldPct: 95,
      burningLossMt: 2, endCutMt: 4, missRollMt: 3, rejectMt: 1,
      balanceGapMt: 0, qualityGapMt: 0, storesMt: 190, storesGapMt: 0,
    });
  });

  test('a day with no voucher is null throughout — never zero', () => {
    const [d] = buildLogDays(['2026-09-30'], [], new Map());
    expect(d.entryDays).toBe(0);
    expect([d.inputMt, d.productionMt, d.yieldPct, d.balanceGapMt]).toEqual([null, null, null, null]);
  });

  test('checks catch a voucher that does not balance, a split that does not add up, and stores that disagree', () => {
    const days = buildLogDays(
      ['2026-09-22', '2026-09-23'],
      [voucher('2026-09-22', { REJECT_MT: 1.5 }), voucher('2026-09-23', { PRIME_MT: 89 })],
      new Map([['2026-09-22', 95], ['2026-09-23', 94]]),
    );
    expect(days[0].balanceGapMt).toBe(-1);
    expect(days[1]).toMatchObject({ qualityGapMt: 1, storesGapMt: 1 });
    const t = summariseLog('total', 'Total', days);
    expect(t).toMatchObject({ entryDays: 2, balanceOkDays: 1, qualityOkDays: 1, storesOkDays: 1, balanceGapMt: -1 });
  });

  test('period yield is a ratio of sums, not a mean of daily percentages', () => {
    const days = buildLogDays(
      ['2026-09-22', '2026-09-23'],
      [voucher('2026-09-22'), voucher('2026-09-23', { INPUT_MT: 300, PRODUCTION_MT: 240, PRIME_MT: 235, BLOSS_MT: 55 })],
      new Map(),
    );
    const t = summariseLog('total', 'Total', days);
    // (95 + 240) ÷ (100 + 300) = 83.75 %; the mean of 95 % and 80 % would be 87.5 %.
    expect(t.yieldPct).toBe(83.75);
    expect(t.productionMt).toBe(335);
  });

  test('a period with some days not entered sums the entered days and says how many', () => {
    const t = summariseLog('total', 'Total', buildLogDays(['2026-09-28', '2026-09-29', '2026-09-30'], [voucher('2026-09-28')], new Map()));
    expect(t).toMatchObject({ days: 3, entryDays: 1, productionMt: 95 });
  });
});

test.describe('strip spec from the ERP item name', () => {
  test('reads width range, thickness and defective, across the name styles in use', () => {
    expect(parseStripSpec('MS STRIP  (230 - 232  X 1.20 MM)')).toEqual({ width: '230–232', thickness: 1.2, defective: false });
    expect(parseStripSpec('MS STRIP (274 - 276 X 2.50) MM Direct')).toEqual({ width: '274–276', thickness: 2.5, defective: false });
    expect(parseStripSpec('MS STRIP (184-186X1.6MM) DEFECTIVE')).toEqual({ width: '184–186', thickness: 1.6, defective: true });
    expect(parseStripSpec('MILL SCALE')).toBeNull();
  });
});

test.describe('stand group state', () => {
  const s = (id: string, on: boolean | null, fresh = true): StandNow =>
    ({ id, group: 'roughing', on, currentA: null, rpm: null, forceT: null, at: null, fresh });
  test('all on, some on, all off, and no fresh reading are four different states', () => {
    expect(groupState([s('RM_01', true), s('RM_02', true)], 'roughing')).toMatchObject({ state: 'all-on', stateLabel: 'All stands on' });
    expect(groupState([s('RM_01', true), s('RM_02', false)], 'roughing')).toMatchObject({ state: 'partial', stateLabel: '1 of 2 on' });
    expect(groupState([s('RM_01', false), s('RM_02', false)], 'roughing')).toMatchObject({ state: 'all-off' });
    // A stalled feed is "no live data", never the last state it reported.
    expect(groupState([s('RM_01', null, false), s('RM_02', null, false)], 'roughing')).toMatchObject({ state: 'no-data', stateLabel: 'No live data' });
  });
});

test.describe('API validation', () => {
  const call = async (fn: (r: Request) => Promise<Response> | Response, qs: string) => {
    const res = await fn(new Request(`http://x/api?${qs}`));
    return { status: res.status, body: await res.json() };
  };
  test('range routes reject bad input with a named error', async () => {
    for (const fn of [logsheet, sizes, orders, billets]) {
      expect(await call(fn, 'from=2026-09-30&to=2026-09-21')).toMatchObject({ status: 400, body: { error: 'bad_range' } });
      expect(await call(fn, 'from=x&to=2026-09-21')).toMatchObject({ status: 400, body: { error: 'bad_range' } });
      expect(await call(fn, 'from=2024-01-01&to=2026-09-21')).toMatchObject({ status: 400, body: { error: 'range_too_long' } });
    }
    for (const fn of [logsheet, orders, billets]) {
      expect(await call(fn, 'from=2026-09-21&to=2026-09-22&grain=hour')).toMatchObject({ status: 400, body: { error: 'bad_grain' } });
    }
  });
  test('the stand trend accepts only known groups, readings and windows', async () => {
    expect(await call(stands, 'group=intermediate')).toMatchObject({ status: 400, body: { error: 'bad_group' } });
    expect(await call(stands, 'group=roughing&metric=temperature')).toMatchObject({ status: 400, body: { error: 'bad_metric' } });
    expect(await call(stands, 'group=roughing&hours=5')).toMatchObject({ status: 400, body: { error: 'bad_hours' } });
  });
});

test.describe('stock', () => {
  test('financial year runs 1 April → 31 March, labelled as the ERP does', () => {
    expect(financialYear('2026-10-05')).toEqual({ label: '26-27', start: '2026-04-01' });
    expect(financialYear('2026-03-31')).toEqual({ label: '25-26', start: '2025-04-01' });
    expect(financialYear('2026-04-01')).toEqual({ label: '26-27', start: '2026-04-01' });
  });
});
