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
import { readErpLsmProduction, type LsmLogField, type LsmLogRow, type LsmReceipt } from '../../integrations/erp/cache';
import { sectionLabelOf } from './stock.service';
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

/**
 * On-line rolling % over several entries, tonnes first, as the plant's casting sheet and HSM / RMS (the user, 26 Nov 2026):
 * Σ billet input ÷ Σ the tonnes each entry's % divides by × 100 — never an average of the %. This log sheet has no
 * cast / delivery tonnes, so each entry's are read back from its own figures: input ÷ (% ÷ 100). One entry gives exactly
 * the ERP's %. An entry with no input, or its % blank or 0, is left out of both sides. A typing slip in a % counts as
 * filed (RMD 30 Nov 2025: 5,089 % / 1,448 %) — for the plant to correct.
 */
function rollingPct(rows: LsmLogRow[], f: 'ROLLING_PERCENTAGE_CASTING' | 'ROLLING_PERCENTAGE_DELIVERY'): number | null {
  const v = rows.flatMap((r) => {
    const input = valueOf(r, 'INPUT_MT');
    const pct = valueOf(r, f);
    return input !== null && input > 0 && pct !== null && pct > 0 ? [{ input, of: input / (pct / 100) }] : [];
  });
  if (!v.length) return null;
  return round2((v.reduce((a, x) => a + x.input, 0) / v.reduce((a, x) => a + x.of, 0)) * 100);
}

const runHrs = (r: LsmLogRow) => valueOf(r, 'NET_RUNNING_HRS');
const runAndDelayHrs = (r: LsmLogRow) => {
  const run = valueOf(r, 'NET_RUNNING_HRS');
  return run === null ? null : run + (valueOf(r, 'DELAY_HRS') ?? 0);
};
const inputMt = (r: LsmLogRow) => valueOf(r, 'INPUT_MT');

/** The sections rolled over the dates: the non-defective finished receipts, by section, largest first. */
export function sectionsOf(dates: string[], receipts: LsmReceipt[]): LsmProductionPeriod['sections'] {
  const by = new Map<string, { mt: number; sort: number }>();
  for (const r of receipts) {
    if (r.date < dates[0] || r.date > dates[dates.length - 1] || /DEFECTIVE/i.test(r.name)) continue;
    const s = sectionLabelOf(r.name);
    if (!s) continue;
    const g = by.get(s.label) ?? { mt: 0, sort: s.sort };
    g.mt += r.mt;
    by.set(s.label, g);
  }
  return [...by].map(([label, g]) => ({ label, mt: round2(g.mt) })).sort((a, b) => b.mt - a.mt || a.label.localeCompare(b.label));
}

export function summariseLsm(key: string, label: string, dates: string[], rows: LsmLogRow[], receipts: LsmReceipt[] = []): LsmProductionPeriod {
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
    rollingInCastingPct: rollingPct(mine, 'ROLLING_PERCENTAGE_CASTING'),
    rollingInDeliveryPct: rollingPct(mine, 'ROLLING_PERCENTAGE_DELIVERY'),
    sections: sectionsOf(dates, receipts),
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
    rows: [...groups].map(([key, g]) => summariseLsm(key, g.label, g.dates, rows, cache?.receipts ?? [])),
    totals: summariseLsm('total', 'Total', dates, rows, cache?.receipts ?? []),
  };
}

/** Production per date, MT (for specific energy); null where none is entered. */
export function lsmProductionByDay(env: Env, dates: string[]): Map<string, number | null> {
  const rows = readErpLsmProduction(env)?.rows ?? [];
  return new Map(dates.map((d) => [d, sumOf(rows.filter((r) => r.date === d), 'PRODUTION_MT')]));
}
