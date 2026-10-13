/**
 * LSM production and losses from the ERP Production Log Sheet, as the plant specified
 * (lsm ERP DATA (1).xlsx): ATTR_TRAN_DATA_BODY, USER_CODE = 'FA-LP-P', ATTR_CODE → ATTR_VALUE,
 * dated by VRDATE. A date's figure is the sum of its entries.
 *
 *   production  PRODUTION_MT (the sheet's PRODUCTION_MT, as the table spells it)
 *   losses      B_LOSS_MT, ENDCUT_MT, MISROLL_MT, COLD_MT, REJECT_MT
 *   bypasses    LSM_BY_PASS_MT, CCM_BY_PASS_MT, END_CRACK_BY_PASS_CCM_MT
 *
 * Billet input in MT is not among the codes given, so mass yield and mass difference are NA.
 */
import type { Env } from '../../config/env';
import type { Grain, LsmProductionPeriod, LsmProductionReport } from '../../contracts';
import { readErpLsmProduction, type LsmLogField, type LsmLogRow } from '../../integrations/erp/cache';
import { MSG } from '../../shared/messages';
import { dateRange, periodOf, round2 } from '../hsm/production.service';

const sumOf = (rows: LsmLogRow[], f: LsmLogField) => {
  const v = rows.map((r) => r.v[f]).filter((x): x is number => x !== null);
  return v.length ? round2(v.reduce((a, b) => a + b, 0)) : null;
};

export function summariseLsm(key: string, label: string, dates: string[], rows: LsmLogRow[]): LsmProductionPeriod {
  const mine = rows.filter((r) => r.date >= dates[0] && r.date <= dates[dates.length - 1]);
  const losses = (['B_LOSS_MT', 'ENDCUT_MT', 'MISROLL_MT', 'COLD_MT', 'REJECT_MT'] as const).map((f) => sumOf(mine, f));
  return {
    key, label, fromDate: dates[0], toDate: dates[dates.length - 1], days: dates.length,
    entryDays: new Set(mine.map((r) => r.date)).size,
    productionMt: sumOf(mine, 'PRODUTION_MT'),
    burningLossMt: losses[0], endCutMt: losses[1], missRollMt: losses[2], coldMt: losses[3], rejectMt: losses[4],
    lossesMt: losses.every((l) => l === null) ? null : round2(losses.reduce<number>((a, l) => a + (l ?? 0), 0)),
    lsmBypassMt: sumOf(mine, 'LSM_BY_PASS_MT'),
    ccmBypassMt: sumOf(mine, 'CCM_BY_PASS_MT'),
    endCrackBypassMt: sumOf(mine, 'END_CRACK_BY_PASS_CCM_MT'),
  };
}

export function lsmProduction(env: Env, from: string, to: string, grain: Grain): LsmProductionReport {
  const cache = readErpLsmProduction(env);
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
    rows: [...groups].map(([key, g]) => summariseLsm(key, g.label, g.dates, rows)),
    totals: summariseLsm('total', 'Total', dates, rows),
  };
}
