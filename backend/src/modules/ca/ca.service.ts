/**
 * Condition Analytics costing per mill — the only source of every mill's costing, HSM included (the plant's
 * September 2026 costing sheet was moved into the CA Inputs form, 31 Oct 2026) — the HSM KPI sheet's formulas (the user, 28–29 Oct 2026): the
 * nine CA inputs the plant saves on the dashboard for each month (logbook CA Inputs form) with what the
 * mill's sources give for the period — production and running hours (the Actual rate card), power
 * (the Specific energy form), billet input and mass yield (the ERP log sheet).
 *
 * A period is worked out month by month, each month with its own inputs, then added up: ₹ and MT are
 * summed, ₹/MT is the sum of ₹ over the sum of MT. A month without inputs leaves every figure that
 * needs them NA for the whole period (it is listed in `missing`). The month's other conversion cost
 * (a ₹ total) counts by the share of the month's days inside the period. The power costs use the
 * mill's kWh/MT exactly as its Specific energy card works it out, so the two always agree.
 *
 * Output opportunity and Output margin are potentials: no source says whether billets or orders were
 * there for the extra tonnes (the user, 28 Oct 2026).
 */
import type { Env } from '../../config/env';
import type { CaActual, CaInputs, CaKpis, CaMonthPart, CaReport } from '../../contracts';
import { runningRate } from '../hsm/running-rate.service';
import { yieldComparison } from '../hsm/yield.service';
import { lsmProduction, lsmProductionByDay } from '../lsm/production.service';
import { formRunningRate } from '../lsm/running-rate.service';
import { LSM_SHEET_FORM } from '../lsm/plan.service';
import { lsmPowerReport, powerReport, rmdPowerReport, rmsPowerReport } from '../power/power.service';
import { rmdProduction } from '../rmd/production.service';
import { rmdRunningRate } from '../rmd/running-rate.service';
import { rmsProduction, rmsProductionByDay } from '../rms/production.service';
import { RMS_SHEET_FORM } from '../rms/plan.service';
import { savedCaInputs } from '../forms-db/ca.store';
import type { ConfigMill } from '../forms-db/forms';

/** Every month (YYYY-MM) the period touches, oldest first. */
export function monthsOf(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const end = to.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(key);
    if (key >= end) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

const KEYS: (keyof CaInputs)[] = [
  'benchmarkRateTph', 'benchmarkKwhPerMt', 'standardYieldPct', 'tariffActual', 'tariffStandard',
  'otherConversionActualRs', 'otherConversionStandard', 'netMaterialPerMt', 'contributionPerMt',
];
const DAY_MS = 86_400_000;
const daysIn = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
const lastOf = (month: string) =>
  `${month}-${String(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`;
const div = (a: number | null, b: number | null) => (a === null || b === null || b <= 0 ? null : a / b);

/** The mill's own figures for one stretch of days. */
export async function caActual(env: Env, mill: ConfigMill, from: string, to: string): Promise<CaActual> {
  if (mill === 'hsm') {
    const [rate, yld, power] = await Promise.all([
      runningRate(env, from, to, 'day'), yieldComparison(env, from, to, 'day'), powerReport(env, from, to),
    ]);
    // As the Actual rate card: ERP MT ÷ historian running hours over the days that have both.
    const both = rate.days.filter((d) => d.erpMt !== null && d.runH !== null && d.runH > 0);
    const runH = both.length ? both.reduce((a, d) => a + d.runH!, 0) : null;
    const rateMt = both.reduce((a, d) => a + d.erpMt!, 0);
    const mt = rate.totals.erpMt;
    // As the Specific energy card: Σ power ÷ Σ ERP production over the days that have both.
    const erp = new Map(rate.days.map((d) => [d.date, d.erpMt]));
    const paired = power.days.filter((d) => d.kwh !== null && (erp.get(d.date) ?? 0) > 0);
    const pairedKwh = paired.length ? paired.reduce((a, d) => a + d.kwh!, 0) : null;
    return {
      mt, runH, rateTph: div(runH === null ? null : rateMt, runH),
      kwh: power.totals.kwh, kwhPerMt: div(pairedKwh, paired.reduce((a, d) => a + erp.get(d.date)!, 0)),
      billetInputMt: yld.totals.erpInputMt, yieldPct: yld.totals.erpYieldPct,
    };
  }
  const [rate, prod, power] = await Promise.all(
    mill === 'rmd'
      ? [rmdRunningRate(env, from, to, 'day'), rmdProduction(env, from, to, 'day'), rmdPowerReport(env, from, to)]
      : mill === 'lsm'
        ? [formRunningRate(env, from, to, 'day', { form: LSM_SHEET_FORM, dayStartMin: 9 * 60, production: (d) => lsmProductionByDay(env, d) }),
          lsmProduction(env, from, to, 'day'), lsmPowerReport(env, from, to)]
        : [formRunningRate(env, from, to, 'day', { form: RMS_SHEET_FORM, dayStartMin: 9 * 60 + 30, production: (d) => rmsProductionByDay(env, d) }),
          rmsProduction(env, from, to, 'day'), rmsPowerReport(env, from, to)],
  );
  const mt = prod.totals.productionMt;
  return {
    mt, runH: rate.totals.runH, rateTph: rate.totals.rateTph,
    kwh: power.totals.kwh, kwhPerMt: power.totals.kwhPerMt,
    billetInputMt: prod.totals.billetInputMt, yieldPct: prod.totals.massYieldPct,
  };
}

const NONE: CaKpis = {
  opportunityMt: null, conversionRs: null, conversionPerMt: null, standardPerMt: null, variancePerMt: null,
  variance: null, yieldLossRs: null, marginRs: null, otherActualPerMt: null,
};

/** One month's part of the period: its inputs × its figures. */
export function caKpis(i: CaInputs | null, a: CaActual, share: number): CaKpis {
  if (!i) return NONE;
  const opportunityMt = a.rateTph !== null && a.runH !== null ? Math.max(0, i.benchmarkRateTph - a.rateTph) * a.runH : null;
  const otherRs = i.otherConversionActualRs * share;
  const standardPerMt = i.benchmarkKwhPerMt * i.tariffStandard + i.otherConversionStandard;
  const e = a.kwhPerMt;
  const mt = a.mt !== null && a.mt > 0 ? a.mt : null;
  const conversionPerMt = e === null || mt === null ? null : e * i.tariffActual + otherRs / mt;
  const conversionRs = conversionPerMt === null ? null : conversionPerMt * mt!;
  const variance = e !== null && mt !== null ? {
    tariffRs: e * (i.tariffActual - i.tariffStandard) * mt,
    energyRs: (e - i.benchmarkKwhPerMt) * i.tariffStandard * mt,
    otherRs: otherRs - i.otherConversionStandard * mt,
    totalRs: 0,
  } : null;
  if (variance) variance.totalRs = variance.tariffRs + variance.energyRs + variance.otherRs;
  return {
    opportunityMt,
    conversionRs,
    conversionPerMt,
    standardPerMt,
    variancePerMt: conversionPerMt === null ? null : conversionPerMt - standardPerMt,
    variance,
    yieldLossRs: a.yieldPct !== null && a.billetInputMt !== null
      ? (Math.max(0, i.standardYieldPct - a.yieldPct) / 100) * a.billetInputMt * i.netMaterialPerMt : null,
    marginRs: opportunityMt === null ? null : opportunityMt * i.contributionPerMt,
    otherActualPerMt: div(otherRs, a.mt),
  };
}

const total = (xs: (number | null)[]) => (xs.length && xs.every((x) => x !== null) ? xs.reduce<number>((s, x) => s + x!, 0) : null);

/** The period from its month parts: ₹ and MT added up; ₹/MT = Σ ₹ ÷ Σ MT. */
export function caPeriod(mill: string, from: string, to: string, months: CaMonthPart[]): CaReport {
  const missing = months.filter((m) => !m.inputs).map((m) => m.month);
  const sumA = (k: 'mt' | 'runH' | 'kwh' | 'billetInputMt') => total(months.map((m) => m.actual[k]));
  const mt = sumA('mt'); const runH = sumA('runH'); const kwh = sumA('kwh'); const billet = sumA('billetInputMt');
  // Rate and yield over the period: each month's weighted by its hours / billet input.
  const kwhMt = total(months.map((m) => (m.actual.kwhPerMt === null || m.actual.mt === null ? null : m.actual.kwhPerMt * m.actual.mt)));
  const rateMt = total(months.map((m) => (m.actual.rateTph === null || m.actual.runH === null ? null : m.actual.rateTph * m.actual.runH)));
  const goodMt = total(months.map((m) => (m.actual.yieldPct === null || m.actual.billetInputMt === null ? null : (m.actual.yieldPct / 100) * m.actual.billetInputMt)));
  const actual: CaActual = {
    mt, runH, rateTph: div(rateMt, runH), kwh, kwhPerMt: div(kwhMt, mt),
    billetInputMt: billet, yieldPct: goodMt === null || billet === null || billet <= 0 ? null : (goodMt / billet) * 100,
  };
  const weights = months.map((m) => daysIn(m.from, m.to));
  const inputs = missing.length ? null : Object.fromEntries(KEYS.map((k) => [k,
    k === 'otherConversionActualRs'
      ? months.reduce((s, m) => s + m.inputs![k] * m.share, 0)   // the ₹ that counts in the period
      : months.reduce((s, m, j) => s + m.inputs![k] * weights[j], 0) / weights.reduce((a, b) => a + b, 0),
  ])) as unknown as CaInputs;
  if (missing.length) return { mill, from, to, months, missing, inputs, actual, kpis: NONE };
  const k = months.map((m) => m.kpis);
  const conversionRs = total(k.map((x) => x.conversionRs));
  const standardRs = total(months.map((m) => (m.actual.mt === null ? null : m.kpis.standardPerMt! * m.actual.mt)));
  const conversionPerMt = div(conversionRs, mt);
  const standardPerMt = div(standardRs, mt) ?? (months.length === 1 ? k[0].standardPerMt : null);
  const v = k.every((x) => x.variance) ? k.map((x) => x.variance!) : null;
  const otherRs = months.reduce((s, m) => s + m.inputs!.otherConversionActualRs * m.share, 0);
  return {
    mill, from, to, months, missing, inputs, actual,
    kpis: {
      opportunityMt: total(k.map((x) => x.opportunityMt)),
      conversionRs,
      conversionPerMt,
      standardPerMt,
      variancePerMt: conversionPerMt === null || standardPerMt === null ? null : conversionPerMt - standardPerMt,
      variance: v && {
        tariffRs: v.reduce((s, x) => s + x.tariffRs, 0), energyRs: v.reduce((s, x) => s + x.energyRs, 0),
        otherRs: v.reduce((s, x) => s + x.otherRs, 0), totalRs: v.reduce((s, x) => s + x.totalRs, 0),
      },
      yieldLossRs: total(k.map((x) => x.yieldLossRs)),
      marginRs: total(k.map((x) => x.marginRs)),
      otherActualPerMt: div(otherRs, mt),
    },
  };
}

export async function caReport(env: Env, mill: ConfigMill, from: string, to: string): Promise<CaReport> {
  const months = await Promise.all(monthsOf(from, to).map(async (month): Promise<CaMonthPart> => {
    const f = from > `${month}-01` ? from : `${month}-01`;
    const t = to < lastOf(month) ? to : lastOf(month);
    const [saved, actual] = await Promise.all([savedCaInputs(env, mill, month), caActual(env, mill, f, t)]);
    const inputs = saved.saved && KEYS.every((k) => saved.values[k] != null)
      ? (Object.fromEntries(KEYS.map((k) => [k, saved.values[k]!])) as unknown as CaInputs) : null;
    const share = daysIn(f, t) / daysIn(`${month}-01`, lastOf(month));
    return { month, from: f, to: t, share, inputs, actual, kpis: caKpis(inputs, actual, share) };
  }));
  return caPeriod(mill, from, to, months);
}
