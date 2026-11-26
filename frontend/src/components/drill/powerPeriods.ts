/**
 * The power report's days grouped by day / week / month for the Power and Specific energy
 * drawers — the same sums the backend makes for the totals: kWh and production added up,
 * specific energy = Σ kWh ÷ Σ production. `paired` (RMS, on prime production): both summed over
 * the days that have both, so a day without one of them doesn't bend the figure. RMS days carry
 * the form's split (meters, shares, power factor), summed the same way.
 */
import type { Grain } from '@contracts';
import { groupDays } from '@/lib/periods';
import type { PowerDay, RmsPowerSplit } from '@/services/hsmApi';

export interface PowerPeriod {
  key: string;
  label: string;
  fromDate: string;
  toDate: string;
  kwh: number | null;
  byEquipment: Record<string, number>;
  productionMt: number | null;
  kwhPerMt: number | null;
  /** `paired`: Σ kWh of the days with both power and production. */
  pairedKwh?: number | null;
  rms?: RmsPowerSplit;
}

const sumOrNull = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

const SUMS = ['vcb1Kwh', 'vcb2Kwh', 'vcb1Kvah', 'vcb2Kvah', 'totalKwh', 'hsmShareKwh', 'crusherKwh', 'colonyKwh', 'rmsKwh', 'meterOnlyKwh'] as const;
const ratio = (a: number | null, b: number | null) => (a === null || !b ? null : Math.round((a / b) * 1000) / 1000);

/** Several days' RMS split as one: figures summed; power factor = Σ kWh ÷ Σ kVAh over the days with both. */
export function rmsSplitSum(parts: RmsPowerSplit[]): RmsPowerSplit {
  const pairs = (kwh: 'vcb1Kwh' | 'vcb2Kwh', kvah: 'vcb1Kvah' | 'vcb2Kvah') => parts.filter((p) => p[kwh] !== null && p[kvah]).map((p) => [p[kwh]!, p[kvah]!]);
  const one = pairs('vcb1Kwh', 'vcb1Kvah');
  const two = pairs('vcb2Kwh', 'vcb2Kvah');
  const tot = (ps: number[][], i: number) => (ps.length ? ps.reduce((a, p) => a + p[i], 0) : null);
  return {
    ...(Object.fromEntries(SUMS.map((k) => [k, sumOrNull(parts.map((p) => p[k]))])) as Pick<RmsPowerSplit, (typeof SUMS)[number]>),
    pf1: ratio(tot(one, 0), tot(one, 1)), pf2: ratio(tot(two, 0), tot(two, 1)),
    pf: ratio(tot([...one, ...two], 0), tot([...one, ...two], 1)),
  };
}

export function powerPeriods(days: PowerDay[], grain: Grain, paired = false): PowerPeriod[] {
  return groupDays(days, grain).map((g) => {
    const kwh = sumOrNull(g.days.map((d) => d.kwh));
    const both = paired ? g.days.filter((d) => d.kwh !== null && d.productionMt) : g.days;
    const pairedKwh = paired ? sumOrNull(both.map((d) => d.kwh)) : kwh;
    const productionMt = sumOrNull(both.map((d) => d.productionMt));
    const byEquipment: Record<string, number> = {};
    for (const d of g.days) for (const [e, v] of Object.entries(d.byEquipment)) byEquipment[e] = (byEquipment[e] ?? 0) + v;
    const splits = g.days.map((d) => d.rms).filter((x): x is RmsPowerSplit => !!x);
    return {
      key: g.key, label: g.label, fromDate: g.fromDate, toDate: g.toDate,
      kwh, byEquipment, productionMt,
      kwhPerMt: pairedKwh === null || !productionMt ? null : pairedKwh / productionMt,
      ...(paired ? { pairedKwh } : {}),
      ...(splits.length ? { rms: rmsSplitSum(splits) } : {}),
    };
  });
}
