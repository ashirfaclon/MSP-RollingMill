/**
 * RMD running rate (TPH), per RMD day / week / month, all from the ERP log sheet (the plant,
 * 13 Nov 2026):
 *
 *   TPH = billet input (INPUT_MT) ÷ adjusted running hours
 *   adjusted running hours = double-stand hours + single-stand hours ÷ 2
 *
 * The mill rolls double-stand or single-stand; single-stand hours count half. MILL_SINGLE_STAND is
 * entered in minutes and is already inside ACTUAL_RUNNING_HRS, so adjusted = running hours −
 * single-stand hours ÷ 2. Online / Offline: that rolling's entries only (production.service.ts).
 */
import type { Env } from '../../config/env';
import type { Grain, RmdMode, RmdRunningRateReport, RmdTphPeriod } from '../../contracts';
import { readErpRmdProduction } from '../../integrations/erp/cache';
import { MSG } from '../../shared/messages';
import { dateRange, periodOf, round2 } from '../hsm/production.service';
import { ofMode, sumOf } from './production.service';

/** Input ÷ hours; null without input or without running time. */
export const rmdRate = (mt: number | null, h: number | null) => (mt === null || !h ? null : round2(mt / h));

/** Running hours less half the single-stand time (minutes); null without running hours. */
export const adjustedHours = (runH: number | null, singleMin: number | null) =>
  (runH === null ? null : round2(runH - (singleMin ?? 0) / 120));

export function rmdRunningRate(env: Env, from: string, to: string, grain: Grain, mode: RmdMode = 'all'): RmdRunningRateReport {
  const cache = readErpRmdProduction(env);
  const rows = ofMode(cache?.rows ?? [], mode);
  const dates = dateRange(from, to);

  const period = (key: string, label: string, ds: string[]): RmdTphPeriod => {
    const set = new Set(ds);
    const mine = rows.filter((r) => set.has(r.date));
    const runH = sumOf(mine, 'ACTUAL_RUNNING_HRS');
    const singleMin = sumOf(mine, 'MILL_SINGLE_STAND');
    const adjustedH = adjustedHours(runH, singleMin);
    const inputMt = sumOf(mine, 'INPUT_MT');
    return {
      key, label, fromDate: ds[0], toDate: ds[ds.length - 1], days: ds.length,
      inputMt, runH, singleStandH: runH === null ? null : round2((singleMin ?? 0) / 60), adjustedH, rateTph: rmdRate(inputMt, adjustedH),
    };
  };
  const groups = new Map<string, { label: string; dates: string[] }>();
  for (const d of dates) {
    const p = periodOf(d, grain);
    const g = groups.get(p.key) ?? { label: p.label, dates: [] };
    g.dates.push(d);
    groups.set(p.key, g);
  }
  return {
    from, to, grain, mode,
    erp: { connection: cache ? 'up' : 'down', message: cache ? MSG.ERP_UP : MSG.ERP_NOT_SYNCED },
    rows: [...groups].map(([key, g]) => period(key, g.label, g.dates)),
    totals: period('total', 'Total', dates),
  };
}
