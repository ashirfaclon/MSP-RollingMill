/**
 * RMD production and losses from the ERP Production Log Sheet, as the plant specified
 * (RMD - ERP Data Filled.xlsx): ATTR_TRAN_DATA_BODY, USER_CODE = 'FA-SKJ', ATTR_CODE →
 * ATTR_VALUE, dated by VRDATE. A date's figure is the sum of its entries (often two a day).
 *
 *   production  PRODUCT_PRIME_SLENGTH_MT
 *   losses      BLOSS_MT (burning loss), ENDCUT_MT, MISROLL_MT, CHIP_OFF_MT (rejection)
 *
 * Mass yield and mass difference need billet input in MT, which has no source yet: their
 * logic is here and they stay null until it is wired.
 */
import type { Env } from '../../config/env';
import type { Grain, RmdProductionPeriod, RmdProductionReport } from '../../contracts';
import { readErpRmdProduction, type RmdLogField, type RmdLogRow } from '../../integrations/erp/cache';
import { MSG } from '../../shared/messages';
import { dateRange, periodOf, round2 } from '../hsm/production.service';

/** Production ÷ billet input × 100; null without both (or with no input). */
export const massYield = (productionMt: number | null, inputMt: number | null) =>
  (productionMt === null || !inputMt ? null : round2((productionMt / inputMt) * 100));
/** Billet input − production; null without both. */
export const massDifference = (inputMt: number | null, productionMt: number | null) =>
  (inputMt === null || productionMt === null ? null : round2(inputMt - productionMt));

const sumOf = (rows: RmdLogRow[], f: RmdLogField) => {
  const v = rows.map((r) => r.v[f]).filter((x): x is number => x !== null);
  return v.length ? round2(v.reduce((a, b) => a + b, 0)) : null;
};

export function summarise(key: string, label: string, dates: string[], rows: RmdLogRow[]): RmdProductionPeriod {
  const mine = rows.filter((r) => r.date >= dates[0] && r.date <= dates[dates.length - 1]);
  const losses = [sumOf(mine, 'BLOSS_MT'), sumOf(mine, 'ENDCUT_MT'), sumOf(mine, 'MISROLL_MT'), sumOf(mine, 'CHIP_OFF_MT')];
  const productionMt = sumOf(mine, 'PRODUCT_PRIME_SLENGTH_MT');
  const billetInputMt: number | null = null;   // no source yet
  return {
    key, label, fromDate: dates[0], toDate: dates[dates.length - 1], days: dates.length,
    entryDays: new Set(mine.map((r) => r.date)).size,
    productionMt,
    burningLossMt: losses[0], endCutMt: losses[1], missRollMt: losses[2], chipOffMt: losses[3],
    lossesMt: losses.every((l) => l === null) ? null : round2(losses.reduce<number>((a, l) => a + (l ?? 0), 0)),
    billetInputMt,
    massDiffMt: massDifference(billetInputMt, productionMt),
    massYieldPct: massYield(productionMt, billetInputMt),
  };
}

export function rmdProduction(env: Env, from: string, to: string, grain: Grain): RmdProductionReport {
  const cache = readErpRmdProduction(env);
  const rows = cache?.rows ?? [];
  const dates = dateRange(from, to);
  const groups = new Map<string, { label: string; dates: string[] }>();
  for (const d of dates) {
    const p = periodOf(d, grain);
    const g = groups.get(p.key) ?? { label: p.label, dates: [] };
    g.dates.push(d);
    groups.set(p.key, g);
  }
  return {
    from, to, grain,
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

/** Production per date, MT (for specific energy and running rate); null where none is entered. */
export function rmdProductionByDay(env: Env, dates: string[]): Map<string, number | null> {
  const rows = readErpRmdProduction(env)?.rows ?? [];
  return new Map(dates.map((d) => [d, sumOf(rows.filter((r) => r.date === d), 'PRODUCT_PRIME_SLENGTH_MT')]));
}
