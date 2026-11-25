/**
 * RMD TPH, per RMD day / week / month: the ERP log sheet's DELIVERY_RATE_MTHRS (the plant's sheet, the user,
 * 25 Nov 2026 — replaces billet input ÷ adjusted running hours). One entry: exactly the ERP's figure. Several:
 * each entry's rate weighted by its ACTUAL_RUNNING_HRS (Σ rate × hours ÷ Σ hours) — every entry exactly as the
 * ERP has it, nothing left out (the user: a wrong entry must show so the plant fixes it — e.g. 7 Nov 2026 Online,
 * 260 running hours, 1.13 TPH). Entries without hours: their plain average. Online / Offline: that rolling's
 * entries only (production.service.ts).
 */
import type { Env } from '../../config/env';
import type { Grain, RmdMode, RmdRunningRateReport, RmdTphPeriod } from '../../contracts';
import { readErpRmdProduction, type RmdLogRow } from '../../integrations/erp/cache';
import { MSG } from '../../shared/messages';
import { dateRange, periodOf, round2 } from '../hsm/production.service';
import { ofMode, sumOf } from './production.service';

/** The entries' delivery rates, weighted by their running hours; null with none. */
export function deliveryRate(rows: RmdLogRow[]): number | null {
  const v = rows.filter((r) => typeof r.v.DELIVERY_RATE_MTHRS === 'number');
  if (!v.length) return null;
  const w = (r: RmdLogRow) => (v.every((x) => (x.v.ACTUAL_RUNNING_HRS ?? 0) > 0) ? r.v.ACTUAL_RUNNING_HRS! : 1);
  return round2(v.reduce((a, r) => a + r.v.DELIVERY_RATE_MTHRS! * w(r), 0) / v.reduce((a, r) => a + w(r), 0));
}

export function rmdRunningRate(env: Env, from: string, to: string, grain: Grain, mode: RmdMode = 'all'): RmdRunningRateReport {
  const cache = readErpRmdProduction(env);
  const rows = ofMode(cache?.rows ?? [], mode);
  const dates = dateRange(from, to);

  const period = (key: string, label: string, ds: string[]): RmdTphPeriod => {
    const set = new Set(ds);
    const mine = rows.filter((r) => set.has(r.date));
    return {
      key, label, fromDate: ds[0], toDate: ds[ds.length - 1], days: ds.length,
      inputMt: sumOf(mine, 'INPUT_MT'), runH: sumOf(mine, 'ACTUAL_RUNNING_HRS'),
      entries: mine.filter((r) => typeof r.v.DELIVERY_RATE_MTHRS === 'number').length,
      rateTph: deliveryRate(mine),
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
