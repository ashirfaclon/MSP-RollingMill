/** LSM production and losses from the ERP log sheet (FA-LP-P codes as the plant gave them). */
import { describe, expect, test } from 'vitest';
import { summariseLsm } from '../../src/modules/lsm/production.service';

const entry = (date: string, vrno: string, prod: number, bloss: number, endcut: number, misroll: number, cold: number, reject: number) => ({
  date, vrno, v: {
    INPUT_MT: 285.44, INPUT_PCS: 1313, PRODUTION_MT: prod, SHORTLENGTH_MT: 2, B_LOSS_MT: bloss, ENDCUT_MT: endcut, MISROLL_MT: misroll, COLD_MT: cold, REJECT_MT: reject,
    LSM_BY_PASS_MT: 1, CCM_BY_PASS_MT: 2, END_CRACK_BY_PASS_CCM_MT: 0, NET_RUNNING_HRS: 9.5,
  },
});
// 11 Oct 2026 as the ERP holds it (L7P26O11-0001).
const ROWS = [entry('2026-10-11', 'L7P26O11-0001', 269.79, 3.18, 8.75, 1.51, 0, 0.21)];

describe('LSM production from the log sheet', () => {
  test('a date: production (PRODUTION_MT), each loss and their sum', () => {
    expect(summariseLsm('d', '11 Oct', ['2026-10-11'], ROWS)).toMatchObject({
      entryDays: 1, productionMt: 269.79, burningLossMt: 3.18, endCutMt: 8.75, missRollMt: 1.51, coldMt: 0, rejectMt: 0.21,
      shortLengthMt: 2, lossesMt: 15.65, lsmBypassMt: 1, ccmBypassMt: 2, endCrackBypassMt: 0,
      // INPUT_MT 285.44: mass difference 15.65 = the six losses; yield 269.79 ÷ 285.44 = 94.52 %.
      billetsPcs: 1313, billetInputMt: 285.44, massDiffMt: 15.65, massYieldPct: 94.52,
    });
  });
  test('a date with no entry is null, not 0', () => {
    expect(summariseLsm('d', '10 Oct', ['2026-10-10'], ROWS)).toMatchObject({ entryDays: 0, productionMt: null, lossesMt: null });
  });
});
