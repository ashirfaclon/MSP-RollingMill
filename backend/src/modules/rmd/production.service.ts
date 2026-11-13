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
