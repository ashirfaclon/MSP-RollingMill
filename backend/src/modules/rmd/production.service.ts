/**
 * RMD production and losses from the ERP Production Log Sheet, as the plant specified
 * (RMD - ERP Data Filled.xlsx): ATTR_TRAN_DATA_BODY, USER_CODE = 'FA-SKJ', ATTR_CODE →
 * ATTR_VALUE, dated by VRDATE. A date's figure is the sum of its entries (often two a day).
 *
 *   production  PRODUCT_PRIME_SLENGTH_MT (prime + short length) — what every other figure uses
 *   prime       FINISH_PRODUCT_PRIME_MT (prime only) — the second daily declaration, shown beside it
 *   losses      BLOSS_MT (burning loss), ENDCUT_MT, MISROLL_MT, CHIP_OFF_MT (rejection)
 *   input       INPUT_MT (billet input)
 *
 * Mass yield = production ÷ billet input × 100; mass difference = billet input − production.
 *
 * Rolling in Casting % / Delivery % (the plant, 21 Nov 2026 — the Zoho TMT KPIs, the ERP's figures): each entry's
 * ROLLING_IN_TOTAL_PERCENTAGE / ROLLING_IN_DELIVERY_PRCNT, over a period their average weighted by billet input.
 * Plant efficiency is worked out here (the user, 26 Nov 2026 — no longer the ERP's PLANT_EFFICIENCY), see plantEfficiency.
 *
 * Online / Offline (`mode`, the user, 13 Nov 2026): only that rolling's entries (RMD_MODE_CODES);
 * all of them for Both. An entry synced before the split has no mode, so it counts under Both only.
 */
import type { Env } from '../../config/env';
import type { Grain, RmdMode, RmdProductionPeriod, RmdProductionReport } from '../../contracts';
import { RMD_BREAKDOWN_FIELDS, readErpRmdProduction, type RmdLogField, type RmdLogRow } from '../../integrations/erp/cache';
import { MSG } from '../../shared/messages';
import { dateRange, periodOf, round2 } from '../hsm/production.service';
import { sectionsRolled } from '../../shared/sections';
import { barLabelOf } from './stock.service';

/** Production ÷ billet input × 100; null without both (or with no input). */
export const massYield = (productionMt: number | null, inputMt: number | null) =>
  (productionMt === null || !inputMt ? null : round2((productionMt / inputMt) * 100));
/** Billet input − production; null without both. */
export const massDifference = (inputMt: number | null, productionMt: number | null) =>
  (inputMt === null || productionMt === null ? null : round2(inputMt - productionMt));

export const sumOf = (rows: RmdLogRow[], f: RmdLogField) => {
  const v = rows.map((r) => r.v[f]).filter((x): x is number => typeof x === 'number');
  return v.length ? round2(v.reduce((a, b) => a + b, 0)) : null;
};

/**
 * On-line rolling % over several entries, tonnes first, as the plant's casting sheet and HSM / RMS (the user, 26 Nov 2026):
 * Σ billet input ÷ Σ the tonnes each entry's % divides by × 100 — never an average of the %. This log sheet has no
 * cast / delivery tonnes, so each entry's are read back from its own figures: input ÷ (% ÷ 100). One entry gives exactly
 * the ERP's %. An entry with no input, or its % blank or 0, is left out of both sides. A typing slip in a % counts as
 * filed (RMD 30 Nov 2025: 5,089 % / 1,448 %) — for the plant to correct.
 */
export function rollingPct(rows: RmdLogRow[], f: 'ROLLING_IN_TOTAL_PERCENTAGE' | 'ROLLING_IN_DELIVERY_PRCNT'): number | null {
  const v = rows.filter((r) => (r.v.INPUT_MT ?? 0) > 0 && (r.v[f] ?? 0) > 0);
  if (!v.length) return null;
  const input = v.reduce((a, r) => a + r.v.INPUT_MT!, 0);
  return round2((input / v.reduce((a, r) => a + r.v.INPUT_MT! / (r.v[f]! / 100), 0)) * 100);
}

/** Coal of one entry, MT: TOTAL_COAL_CONSUMPTION, else COAL_CONSUMPTION_KGMT × Prime + SL ÷ 1000; null with none. */
const coalOf = (r: RmdLogRow): number | null => {
  const total = r.v.TOTAL_COAL_CONSUMPTION;
  if (typeof total === 'number' && total > 0) return total;
  const perMt = r.v.COAL_CONSUMPTION_KGMT;
  const prod = r.v.PRODUCT_PRIME_SLENGTH_MT;
  return typeof perMt === 'number' && perMt > 0 && typeof prod === 'number' ? (perMt * prod) / 1000 : null;
};

/** Coal over the Offline entries that have it: Σ MT, and kg per MT of their Prime + SL. */
export function coal(rows: RmdLogRow[]): { coalMt: number | null; coalKgPerMt: number | null } {
  const burnt = rows.filter((r) => r.mode === 'offline' && coalOf(r) !== null);
  if (!burnt.length) return { coalMt: null, coalKgPerMt: null };
  const mt = burnt.reduce((a, r) => a + coalOf(r)!, 0);
  const prod = burnt.reduce((a, r) => a + (r.v.PRODUCT_PRIME_SLENGTH_MT ?? 0), 0);
  return { coalMt: round2(mt), coalKgPerMt: prod > 0 ? round2((mt * 1000) / prod) : null };
}

/** The dashboard's production plan per date, MT (Prime + SL; the Production Plan form, saved on the dashboard). */
export type PlanByDate = Map<string, number>;

/**
 * Plant efficiency, the plant's formula (the user, 26 Nov 2026), over the dates with both a plan and an ERP entry:
 *   performance  = actual ÷ plan × 100 — two of them: Prime + SL (PRODUCT_PRIME_SLENGTH_MT) and Prime (FINISH_PRODUCT_PRIME_MT),
 *                  both against the one plan (a Prime + SL plan);
 *   availability = ACTUAL_RUNNING_HRS ÷ (ACTUAL_RUNNING_HRS + breakdown + CCM breakdown) × 100 — running hours already
 *                  exclude the stops, so they are added back below the line (the user, 26 Nov 2026); breakdown = the
 *                  Breakdown card's seven items, CCM breakdown = TOTAL_CCM_BD_IN_HRS (Online only);
 *                  an Offline entry's stops never count (the user, 26 Nov 2026): Offline availability is 100 %, so
 *                  Offline efficiency = performance — what was made against the plan;
 *   efficiency   = performance × availability ÷ 100.
 * Over several dates the MT and hours are summed first, then the formula is applied once. Null without a plan.
 */
export function plantEfficiency(rows: RmdLogRow[], plan: PlanByDate | undefined) {
  const none = { planMt: null, effDays: 0, effBreakdownHrs: null, ccmBreakdownHrs: null, performancePct: null, primePerformancePct: null, availabilityPct: null, plantEfficiencyPct: null, primeEfficiencyPct: null };
  if (!plan) return none;
  const dates = [...new Set(rows.map((r) => r.date))].filter((d) => (plan.get(d) ?? 0) > 0);
  if (!dates.length) return none;
  const mine = rows.filter((r) => dates.includes(r.date));
  const planMt = round2(dates.reduce((a, d) => a + plan.get(d)!, 0));
  const sl = sumOf(mine, 'PRODUCT_PRIME_SLENGTH_MT');
  const prime = sumOf(mine, 'FINISH_PRODUCT_PRIME_MT');
  const runH = sumOf(mine, 'ACTUAL_RUNNING_HRS');
  const stops = mine.filter((r) => r.mode !== 'offline');
  const bdH = stops.length ? breakdownOf(stops).breakdownHrs ?? 0 : 0;
  const ccmH = round2(stops.reduce((a, r) => a + Math.max(0, r.v.TOTAL_CCM_BD_IN_HRS ?? 0), 0));
  const pct = (a: number | null, b: number) => (a === null ? null : round2((a / b) * 100));
  const availabilityPct = runH ? round2((runH / (runH + bdH + ccmH)) * 100) : null;
  const performancePct = pct(sl, planMt);
  const primePerformancePct = pct(prime, planMt);
  const eff = (p: number | null) => (p === null || availabilityPct === null ? null : round2((p * availabilityPct) / 100));
  return {
    planMt, effDays: dates.length, effBreakdownHrs: round2(bdH), ccmBreakdownHrs: ccmH, performancePct, primePerformancePct, availabilityPct,
    plantEfficiencyPct: eff(performancePct), primeEfficiencyPct: eff(primePerformancePct),
  };
}

/** The sheet's seven breakdown items over the entries, hours each (negative minutes left out), and their total; null total with no entry. */
export function breakdownOf(rows: RmdLogRow[]): { breakdownHrs: number | null; breakdown: RmdProductionPeriod['breakdown'] } {
  const mins = RMD_BREAKDOWN_FIELDS.map(([code, label]) => ({ code, label, min: rows.reduce((a, r) => a + Math.max(0, r.v[code] ?? 0), 0) }));
  // The total from the minutes, not from the rounded hours (115 min = 1.92 h, not 0.33 + 0.5 + 1.08).
  return {
    breakdownHrs: rows.length ? round2(mins.reduce((a, m) => a + m.min, 0) / 60) : null,
    breakdown: mins.map(({ code, label, min }) => ({ code, label, hrs: round2(min / 60) })),
  };
}

export function summarise(key: string, label: string, dates: string[], rows: RmdLogRow[], plan?: PlanByDate): RmdProductionPeriod {
  const mine = rows.filter((r) => r.date >= dates[0] && r.date <= dates[dates.length - 1]);
  const losses = [sumOf(mine, 'BLOSS_MT'), sumOf(mine, 'ENDCUT_MT'), sumOf(mine, 'MISROLL_MT'), sumOf(mine, 'CHIP_OFF_MT')];
  const productionMt = sumOf(mine, 'PRODUCT_PRIME_SLENGTH_MT');
  const billetInputMt = sumOf(mine, 'INPUT_MT');
  return {
    key, label, fromDate: dates[0], toDate: dates[dates.length - 1], days: dates.length,
    entryDays: new Set(mine.map((r) => r.date)).size,
    productionMt,
    runningHrs: sumOf(mine, 'ACTUAL_RUNNING_HRS'),
    primeMt: sumOf(mine, 'FINISH_PRODUCT_PRIME_MT'),
    burningLossMt: losses[0], endCutMt: losses[1], missRollMt: losses[2], chipOffMt: losses[3],
    lossesMt: losses.every((l) => l === null) ? null : round2(losses.reduce<number>((a, l) => a + (l ?? 0), 0)),
    billetInputMt,
    massDiffMt: massDifference(billetInputMt, productionMt),
    massYieldPct: massYield(productionMt, billetInputMt),
    primeYieldPct: massYield(sumOf(mine, 'FINISH_PRODUCT_PRIME_MT'), billetInputMt),
    ...coal(mine),
    rollingInCastingPct: rollingPct(mine, 'ROLLING_IN_TOTAL_PERCENTAGE'),
    rollingInDeliveryPct: rollingPct(mine, 'ROLLING_IN_DELIVERY_PRCNT'),
    ...plantEfficiency(mine, plan),
    targetMt: sumOf(mine, 'PRODUCTION_TARGET'),
    ...breakdownOf(mine),
    ccmBypassMt: sumOf(mine, 'CCM_BYPASS_MT'),
    millBypassMt: sumOf(mine, 'MILL_BYPASS_MT'),
    shortLengthMt: sumOf(mine, 'FINISH_PRODUCT_SLENGTH_MT'),
  };
}

/** The log sheet's entries for one rolling, or all of them. */
export const ofMode = (rows: RmdLogRow[], mode: RmdMode) => (mode === 'all' ? rows : rows.filter((r) => r.mode === mode));

/** The cached log sheet entries of `mode`. */
export const rmdLogRows = (env: Env, mode: RmdMode) => ofMode(readErpRmdProduction(env)?.rows ?? [], mode);

export function rmdProduction(env: Env, from: string, to: string, grain: Grain, mode: RmdMode = 'all', plan?: PlanByDate): RmdProductionReport {
  const cache = readErpRmdProduction(env);
  const rows = ofMode(cache?.rows ?? [], mode);
  const dates = dateRange(from, to);
  const groups = new Map<string, { label: string; dates: string[] }>();
  for (const d of dates) {
    const p = periodOf(d, grain);
    const g = groups.get(p.key) ?? { label: p.label, dates: [] };
    g.dates.push(d);
    groups.set(p.key, g);
  }
  return {
    from, to, grain, mode,
    erp: {
      connection: cache ? 'up' : 'down',
      message: cache ? MSG.ERP_UP : MSG.ERP_NOT_SYNCED,
      syncedAt: cache?.syncedAt ?? null,
      lastDate: rows.at(-1)?.date ?? null,
    },
    // The bar size(s) the chosen rolling rolled, miss roll left out — they add up to Prime (the user, 25 Nov 2026).
    rows: [...groups].map(([key, g]) => ({ ...summarise(key, g.label, g.dates, rows, plan), sections: sectionsRolled(g.dates, cache?.receipts ?? [], barLabelOf, mode) })),
    totals: { ...summarise('total', 'Total', dates, rows, plan), sections: sectionsRolled(dates, cache?.receipts ?? [], barLabelOf, mode) },
  };
}

/** One log sheet field per date (production for specific energy and running rate); null where none is entered. */
export function rmdByDay(env: Env, dates: string[], mode: RmdMode = 'all', field: RmdLogField = 'PRODUCT_PRIME_SLENGTH_MT'): Map<string, number | null> {
  const rows = rmdLogRows(env, mode);
  return new Map(dates.map((d) => [d, sumOf(rows.filter((r) => r.date === d), field)]));
}

/** Production per date, MT; null where none is entered. */
export const rmdProductionByDay = (env: Env, dates: string[], mode: RmdMode = 'all') => rmdByDay(env, dates, mode);
