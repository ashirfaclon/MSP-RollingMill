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
 * Rolling in Casting % / Delivery % and Plant Efficiency % (the plant, 21 Nov 2026 — the Zoho TMT KPIs,
 * the ERP's figures): each entry's ROLLING_IN_TOTAL_PERCENTAGE / ROLLING_IN_DELIVERY_PRCNT, over a period
 * their average weighted by the entries' billet input; efficiency = Σ production ÷ Σ PRODUCTION_TARGET
 * over the entries that have both, which for one entry is the ERP's PLANT_EFFICIENCY.
 *
 * Online / Offline (`mode`, the user, 13 Nov 2026): only that rolling's entries (RMD_MODE_CODES);
 * all of them for Both. An entry synced before the split has no mode, so it counts under Both only.
 */
import type { Env } from '../../config/env';
import type { Grain, RmdMode, RmdProductionPeriod, RmdProductionReport } from '../../contracts';
import { readErpRmdProduction, type RmdLogField, type RmdLogRow } from '../../integrations/erp/cache';
import { MSG } from '../../shared/messages';
import { dateRange, periodOf, round2 } from '../hsm/production.service';

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

/** A percentage of each entry, over several: weighted by the entry's billet input (equal weights where none is entered). */
export function weightedPct(rows: RmdLogRow[], f: RmdLogField): number | null {
  const v = rows.filter((r) => typeof r.v[f] === 'number');
  if (!v.length) return null;
  const w = (r: RmdLogRow) => (v.every((x) => (x.v.INPUT_MT ?? 0) > 0) ? r.v.INPUT_MT! : 1);
  const total = v.reduce((a, r) => a + w(r), 0);
  return round2(v.reduce((a, r) => a + r.v[f]! * w(r), 0) / total);
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

/** Σ production ÷ Σ target × 100 over the entries with both; null with none. */
export function efficiencyPct(rows: RmdLogRow[]): number | null {
  const both = rows.filter((r) => r.v.PRODUCT_PRIME_SLENGTH_MT !== null && (r.v.PRODUCTION_TARGET ?? 0) > 0);
  if (!both.length) return null;
  const prod = both.reduce((a, r) => a + r.v.PRODUCT_PRIME_SLENGTH_MT!, 0);
  const target = both.reduce((a, r) => a + r.v.PRODUCTION_TARGET!, 0);
  return round2((prod / target) * 100);
}

export function summarise(key: string, label: string, dates: string[], rows: RmdLogRow[]): RmdProductionPeriod {
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
    rollingInCastingPct: weightedPct(mine, 'ROLLING_IN_TOTAL_PERCENTAGE'),
    rollingInDeliveryPct: weightedPct(mine, 'ROLLING_IN_DELIVERY_PRCNT'),
    plantEfficiencyPct: efficiencyPct(mine),
    targetMt: sumOf(mine, 'PRODUCTION_TARGET'),
  };
}

/** The log sheet's entries for one rolling, or all of them. */
export const ofMode = (rows: RmdLogRow[], mode: RmdMode) => (mode === 'all' ? rows : rows.filter((r) => r.mode === mode));

/** The cached log sheet entries of `mode`. */
export const rmdLogRows = (env: Env, mode: RmdMode) => ofMode(readErpRmdProduction(env)?.rows ?? [], mode);

export function rmdProduction(env: Env, from: string, to: string, grain: Grain, mode: RmdMode = 'all'): RmdProductionReport {
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
    rows: [...groups].map(([key, g]) => summarise(key, g.label, g.dates, rows)),
    totals: summarise('total', 'Total', dates, rows),
  };
}

/** One log sheet field per date (production for specific energy and running rate); null where none is entered. */
export function rmdByDay(env: Env, dates: string[], mode: RmdMode = 'all', field: RmdLogField = 'PRODUCT_PRIME_SLENGTH_MT'): Map<string, number | null> {
  const rows = rmdLogRows(env, mode);
  return new Map(dates.map((d) => [d, sumOf(rows.filter((r) => r.date === d), field)]));
}

/** Production per date, MT; null where none is entered. */
export const rmdProductionByDay = (env: Env, dates: string[], mode: RmdMode = 'all') => rmdByDay(env, dates, mode);
