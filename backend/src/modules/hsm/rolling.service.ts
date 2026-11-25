/**
 * HSM: the plant's management KPIs from the ERP Production Log Sheet (HSM.xlsx, "Critical parameter →
 * Visualization"; the user, 23 Nov 2026). Each entry is Online (ST001) or Offline, cold rolling (ST002).
 *
 *   cast, delivery, production, prime   TOTAL_CAST_QTY, DELIVERY_QTY, PRODUCTION_MT, PRIME_MT — Σ over the
 *                                       chosen rolling's entries (Both adds Online and Offline)
 *   rolling w.r.t. casting / delivery   ONLINE entries only, whatever is chosen: the plant fills 100 % on
 *                                       Offline entries just to fill them (the user). Σ INPUT_MT ÷ Σ
 *                                       TOTAL_CAST_QTY (÷ Σ DELIVERY_QTY) × 100 — on one entry the ERP's own
 *                                       ROLLING_PERCENTAGE_CASTING (_DELIVERY)
 *   cold power                          OFFLINE entries only: Σ POWER_CONSUMPTION_IN_KWH, and per tonne
 *                                       ÷ Σ PRODUCTION_MT (the ERP's POWER_CONSUMPTION_KWH_MT on one entry)
 */
import type { Env } from '../../config/env';
import type { Grain, HsmRollingPeriod, HsmRollingReport, RmdMode } from '../../contracts';
import { readErpProduction, type ErpProductionRow, type LogField } from '../../integrations/erp/cache';
import { MSG } from '../../shared/messages';
import { dateRange, periodOf, round2 } from './production.service';
import { sectionsRolled } from '../../shared/sections';
import { stripLabelOf } from './erp-kpis.service';

const sumOf = (rows: ErpProductionRow[], f: LogField) => {
  const v = rows.map((r) => r.v?.[f]).filter((x): x is number => typeof x === 'number');
  return v.length ? round2(v.reduce((a, b) => a + b, 0)) : null;
};

/** Σ a ÷ Σ b × scale over the entries that have both, b above 0; null with none. */
function ratio(rows: ErpProductionRow[], a: LogField, b: LogField, scale: number): number | null {
  const both = rows.filter((r) => typeof r.v?.[a] === 'number' && (r.v?.[b] ?? 0) > 0);
  if (!both.length) return null;
  return round2((both.reduce((x, r) => x + r.v![a]!, 0) / both.reduce((x, r) => x + r.v![b]!, 0)) * scale);
}

export function summariseRolling(key: string, label: string, dates: string[], rows: ErpProductionRow[], mode: RmdMode): HsmRollingPeriod {
  const inPeriod = rows.filter((r) => r.date >= dates[0] && r.date <= dates[dates.length - 1]);
  const mine = mode === 'all' ? inPeriod : inPeriod.filter((r) => r.mode === mode);
  const online = inPeriod.filter((r) => r.mode === 'online');
  const offline = inPeriod.filter((r) => r.mode === 'offline');
  return {
    key, label, fromDate: dates[0], toDate: dates[dates.length - 1], days: dates.length,
    entryDays: new Set(mine.map((r) => r.date)).size,
    castMt: sumOf(mine, 'TOTAL_CAST_QTY'),
    deliveryMt: sumOf(mine, 'DELIVERY_QTY'),
    inputMt: sumOf(mine, 'INPUT_MT'),
    productionMt: sumOf(mine, 'PRODUCTION_MT'),
    primeMt: sumOf(mine, 'PRIME_MT'),
    rollingInCastingPct: ratio(online, 'INPUT_MT', 'TOTAL_CAST_QTY', 100),
    rollingInDeliveryPct: ratio(online, 'INPUT_MT', 'DELIVERY_QTY', 100),
    coldPowerKwh: sumOf(offline, 'POWER_CONSUMPTION_IN_KWH'),
    coldPowerKwhPerMt: ratio(offline, 'POWER_CONSUMPTION_IN_KWH', 'PRODUCTION_MT', 1),
  };
}

export function hsmRolling(env: Env, from: string, to: string, grain: Grain, mode: RmdMode = 'all'): HsmRollingReport {
  const cache = readErpProduction(env);
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
    from, to, grain, mode,
    erp: {
      connection: cache ? 'up' : 'down',
      message: cache ? MSG.ERP_UP : MSG.ERP_NOT_SYNCED,
      syncedAt: cache?.syncedAt ?? null,
      lastDate: rows.at(-1)?.date ?? null,
    },
    // The strip size(s) the chosen rolling rolled, from the receipts tied to its entries (the user, 25 Nov 2026).
    rows: [...groups].map(([key, g]) => ({ ...summariseRolling(key, g.label, g.dates, rows, mode), sections: sectionsRolled(g.dates, cache?.receipts ?? [], stripLabelOf, mode) })),
    totals: { ...summariseRolling('total', 'Total', dates, rows, mode), sections: sectionsRolled(dates, cache?.receipts ?? [], stripLabelOf, mode) },
  };
}
