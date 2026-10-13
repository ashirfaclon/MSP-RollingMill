/**
 * RMS production from the ERP Production Log Sheet — the same sheet and field as HSM, with RMS's
 * division (the user, 13 Oct 2026): ATTR_TRAN_DATA_HEAD + BODY, ENTITY_CODE = 'MP',
 * TNATURE = 'PRLOG', DIV_CODE = 'RS', SERIES = 'L5P' (HSM: S1, L6P), field PRODUCTION_MT; billets
 * in (pieces) INPUT_PCS. Billet input in MT waits for the user (INPUT_MT is almost never filled).
 *
 * The same day is sometimes entered twice with identical figures (1, 3 and 10 Oct 2026): an
 * entry repeating another of its date — same PRODUCTION_MT and PRODUCTION_PCS — is counted once.
 * Checked against the finished goods the ERP received as production for division RS
 * (ITEMTRAN_BODY, TNATURE = 'PROD'): equal on every day of 1–12 Oct 2026, including the days
 * with two different entries (4 and 6 Oct), which are added.
 */
import type { Env } from '../../config/env';
import type { Grain, RmsProductionPeriod, RmsProductionReport } from '../../contracts';
import { readErpRmsProduction, type RmsLogRow } from '../../integrations/erp/cache';
import { MSG } from '../../shared/messages';
import { dateRange, periodOf, round2 } from '../hsm/production.service';

/** Entries of one date that repeat another (same production MT and pieces) are dropped. */
export function distinctEntries(rows: RmsLogRow[]): RmsLogRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.date}|${r.productionMt}|${r.productionPcs}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function summariseRms(key: string, label: string, dates: string[], rows: RmsLogRow[]): RmsProductionPeriod {
  const mine = rows.filter((r) => r.date >= dates[0] && r.date <= dates[dates.length - 1]);
  const v = mine.map((r) => r.productionMt).filter((x): x is number => x !== null);
  const pcs = mine.map((r) => r.inputPcs ?? null).filter((x): x is number => x !== null);
  return {
    key, label, fromDate: dates[0], toDate: dates[dates.length - 1], days: dates.length,
    entryDays: new Set(mine.map((r) => r.date)).size,
    entries: mine.length,
    productionMt: v.length ? round2(v.reduce((a, b) => a + b, 0)) : null,
    billetsPcs: pcs.length ? pcs.reduce((a, b) => a + b, 0) : null,
  };
}

export function rmsProduction(env: Env, from: string, to: string, grain: Grain): RmsProductionReport {
  const cache = readErpRmsProduction(env);
  const rows = distinctEntries(cache?.rows ?? []);
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
    rows: [...groups].map(([key, g]) => summariseRms(key, g.label, g.dates, rows)),
    totals: summariseRms('total', 'Total', dates, rows),
  };
}
