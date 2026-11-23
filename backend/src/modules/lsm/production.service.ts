/**
 * LSM production and losses from the ERP Production Log Sheet, as the plant specified
 * (lsm ERP DATA (1).xlsx): ATTR_TRAN_DATA_BODY, USER_CODE = 'FA-LP-P', ATTR_CODE → ATTR_VALUE,
 * dated by VRDATE. A date's figure is the sum of its entries.
 *
 *   production  PRODUTION_MT (the sheet's PRODUCTION_MT, as the table spells it)
 *   losses      B_LOSS_MT, ENDCUT_MT, MISROLL_MT, COLD_MT, REJECT_MT, SHORTLENGTH_MT
 *   bypasses    LSM_BY_PASS_MT, CCM_BY_PASS_MT, END_CRACK_BY_PASS_CCM_MT — taken out before
 *               billet input (TOTAL_CAST_QTY = INPUT_MT + the three), so not losses
 *   input       INPUT_MT (billet input), INPUT_PCS (billets in, pieces) — the user, 13 Oct 2026
 *   run hours   NET_RUNNING_HRS (Asset Health) — the user, 22 Oct 2026
 *   KPIs        the plant's management KPIs (Management Dash All.xlsx, the user, 23 Nov 2026):
 *               PLANT_AVAILABILITY, PLANT_PERFORMANCE, PLANT_EFFICIENCY, ROLLING_PERCENTAGE_CASTING,
 *               ROLLING_PERCENTAGE_DELIVERY, TOTAL_PRODUCTION (production + short length)
 *
 * Mass yield (prime yield) = production ÷ billet input × 100; yield with non-prime = TOTAL_PRODUCTION ÷
 * billet input × 100; mass difference = billet input − production.
 *
 * One entry shows the ERP's own percentage. Over several, each counts by the hours or tonnes it is a
 * share of, so the period's figure is the one the ERP would give for it as a whole: availability by
 * running + delay hours, performance by running hours, efficiency (availability × performance) by
 * running + delay hours; rolling in casting / delivery by billet input, as RMD's.
 */
import type { Env } from '../../config/env';
import type { Grain, LsmProductionPeriod, LsmProductionReport } from '../../contracts';
import { readErpLsmProduction, type LsmLogField, type LsmLogRow } from '../../integrations/erp/cache';
import { MSG } from '../../shared/messages';
import { dateRange, periodOf, round2 } from '../hsm/production.service';
import { massDifference, massYield } from '../rmd/production.service';

/** A field missing from a cache synced before it was added reads as not entered. */
const valueOf = (r: LsmLogRow, f: LsmLogField) => (typeof r.v[f] === 'number' ? r.v[f] : null);

const sumOf = (rows: LsmLogRow[], f: LsmLogField) => {
  const v = rows.map((r) => valueOf(r, f)).filter((x): x is number => x !== null);
  return v.length ? round2(v.reduce((a, b) => a + b, 0)) : null;
};

/** Each entry's percentage `f`, weighted by `weight` (entries without a positive weight are left out); null with none. */
function weightedPct(rows: LsmLogRow[], f: LsmLogField, weight: (r: LsmLogRow) => number | null): number | null {
  const v = rows.flatMap((r) => {
    const pct = valueOf(r, f);
    const w = weight(r);
    return pct !== null && w !== null && w > 0 ? [{ pct, w }] : [];
  });
  const total = v.reduce((a, x) => a + x.w, 0);
  return total > 0 ? round2(v.reduce((a, x) => a + x.pct * x.w, 0) / total) : null;
}

const runHrs = (r: LsmLogRow) => valueOf(r, 'NET_RUNNING_HRS');
const runAndDelayHrs = (r: LsmLogRow) => {
  const run = valueOf(r, 'NET_RUNNING_HRS');
  return run === null ? null : run + (valueOf(r, 'DELAY_HRS') ?? 0);
};
const inputMt = (r: LsmLogRow) => valueOf(r, 'INPUT_MT');

export function summariseLsm(key: string, label: string, dates: string[], rows: LsmLogRow[]): LsmProductionPeriod {
  const mine = rows.filter((r) => r.date >= dates[0] && r.date <= dates[dates.length - 1]);
  const losses = (['B_LOSS_MT', 'ENDCUT_MT', 'MISROLL_MT', 'COLD_MT', 'REJECT_MT', 'SHORTLENGTH_MT'] as const).map((f) => sumOf(mine, f));
  const productionMt = sumOf(mine, 'PRODUTION_MT');
  const billetInputMt = sumOf(mine, 'INPUT_MT');
  const totalProductionMt = sumOf(mine, 'TOTAL_PRODUCTION');
  return {
    key, label, fromDate: dates[0], toDate: dates[dates.length - 1], days: dates.length,
    entryDays: new Set(mine.map((r) => r.date)).size,
    productionMt,
    burningLossMt: losses[0], endCutMt: losses[1], missRollMt: losses[2], coldMt: losses[3], rejectMt: losses[4], shortLengthMt: losses[5],
    lossesMt: losses.every((l) => l === null) ? null : round2(losses.reduce<number>((a, l) => a + (l ?? 0), 0)),
    billetsPcs: sumOf(mine, 'INPUT_PCS'),
    billetInputMt,
    massDiffMt: massDifference(billetInputMt, productionMt),
    massYieldPct: massYield(productionMt, billetInputMt),
    lsmBypassMt: sumOf(mine, 'LSM_BY_PASS_MT'),
    ccmBypassMt: sumOf(mine, 'CCM_BY_PASS_MT'),
    endCrackBypassMt: sumOf(mine, 'END_CRACK_BY_PASS_CCM_MT'),
    runningHrs: sumOf(mine, 'NET_RUNNING_HRS'),
    delayHrs: sumOf(mine, 'DELAY_HRS'),
    totalProductionMt,
    nonPrimeYieldPct: massYield(totalProductionMt, billetInputMt),
    availabilityPct: weightedPct(mine, 'PLANT_AVAILABILITY', runAndDelayHrs),
    performancePct: weightedPct(mine, 'PLANT_PERFORMANCE', runHrs),
    efficiencyPct: weightedPct(mine, 'PLANT_EFFICIENCY', runAndDelayHrs),
    rollingInCastingPct: weightedPct(mine, 'ROLLING_PERCENTAGE_CASTING', inputMt),
    rollingInDeliveryPct: weightedPct(mine, 'ROLLING_PERCENTAGE_DELIVERY', inputMt),
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

/** Production per date, MT (for specific energy); null where none is entered. */
export function lsmProductionByDay(env: Env, dates: string[]): Map<string, number | null> {
  const rows = readErpLsmProduction(env)?.rows ?? [];
  return new Map(dates.map((d) => [d, sumOf(rows.filter((r) => r.date === d), 'PRODUTION_MT')]));
}
