/**
 * The plant's monthly HSM conversion-cost sheets, as sent (Persona 3 HSM; "Please find the conversion
 * cost & output margin sheet …"). Figures as in the sheet; ₹ per MT is the sheet's own (cost ÷ the
 * month's production). The sheet has no output margin (EBITDA left blank), no standard cost and no
 * standard tariff. TODO(plan-feature): these move to the upload feature with the plans.
 */
import type { CostingMonth } from '../../../contracts';

const line = (name: string, qty: number | null, rate: number | null, rs: number, perMt: number) => ({ name, qty, rate, rs, perMt });

export const COSTING_MONTHS: CostingMonth[] = [
  {
    month: '2026-09',
    source: '2026 Costing - SEP26.xlsx (the plant, 27 Oct 2026)',
    productionMt: 5292.1,
    losses: [
      line('Burning loss', 72.07, 37800, 2724246, 514.78),
      line('Miss roll', 32.52, 6000, 195120, 36.87),
      line('Side trimming', 10, 6000, 60000, 11.34),
      line('End cut', 93.8, 6000, 562800, 106.35),
      line('Reject', 25.53, 6000, 153180, 28.95),
    ],
    power: [
      line('Power online rolling', null, 5.75, 0, 0),
      line('Reheating (cold billet)', 35947, 5.75, 206695.25, 39.06),
      line('Reheating (hot billet)', 129692, 5.75, 745729, 140.91),
      line('Power (mill)', 446697, 5.75, 2568507.75, 485.35),
    ],
    others: [
      line('Spare & stores', null, null, 1738496, 328.51),
      line('Roll', null, null, 537610, 101.59),
      line('Salary to employees', null, null, 2200000, 415.71),
      line('Contract worker', null, null, 3000000, 566.88),
      line('Recoiler', 5400, 130, 702000, 130),
    ],
    conversionPerMt: 2906.29,
    tariffPerKwh: 5.75,
  },
];
