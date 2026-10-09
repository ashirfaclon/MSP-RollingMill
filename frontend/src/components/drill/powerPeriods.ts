/**
 * The power report's days grouped by day / week / month for the Power and Specific energy
 * drawers — the same sums the backend makes for the totals: kWh and production added up,
 * specific energy = Σ kWh ÷ Σ production.
 */
import type { Grain } from '@contracts';
import { groupDays } from '@/lib/periods';
import type { PowerDay } from '@/services/hsmApi';

export interface PowerPeriod {
  key: string;
  label: string;
  fromDate: string;
  toDate: string;
  kwh: number | null;
  byEquipment: Record<string, number>;
  productionMt: number | null;
  kwhPerMt: number | null;
}

const sumOrNull = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

export function powerPeriods(days: PowerDay[], grain: Grain): PowerPeriod[] {
  return groupDays(days, grain).map((g) => {
    const kwh = sumOrNull(g.days.map((d) => d.kwh));
    const productionMt = sumOrNull(g.days.map((d) => d.productionMt));
    const byEquipment: Record<string, number> = {};
    for (const d of g.days) for (const [e, v] of Object.entries(d.byEquipment)) byEquipment[e] = (byEquipment[e] ?? 0) + v;
    return {
      key: g.key, label: g.label, fromDate: g.fromDate, toDate: g.toDate,
      kwh, byEquipment, productionMt,
      kwhPerMt: kwh === null || !productionMt ? null : kwh / productionMt,
    };
  });
}
