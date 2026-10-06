/**
 * HSM figures taken straight from the ERP, each with the cross-check that makes it safe
 * to show. Every figure is a plain sum of synced ERP rows (erp/cache.ts); nothing is
 * estimated, and a day the ERP has not reached yet is null, never zero.
 *
 *   Log sheet (ATTR_TRAN PRLOG · L6P, division S1), per voucher:
 *     input  = production + burning loss + end cut + miss-roll + reject   (balance check)
 *     production = prime + defective + rolling defect                     (quality check)
 *   Stores (PROD_TRAN, finished strip items "F…" received): must equal log-sheet
 *     production for the same date                                         (stores check)
 *   Mass yield = Σ production ÷ Σ input over the period — NOT the ERP's stored
 *     YIELD_PERCENTAGE, whose formula is unknown.
 *
 *   Sizes: PROD_TRAN receipts and SALE lines per strip spec, the spec parsed from the
 *     item name ("MS STRIP (274 - 276 X 2.50) MM").
 *   Orders: SORD lines, latest amendment; pending = ordered − executed − cancelled.
 */
import type { Env } from '../../config/env';
import { MSG } from '../../shared/messages';
import {
  readErpCommercial, readErpProduction, type ErpCommercialCache, type ErpProductionRow, type LogField,
} from '../../integrations/erp/cache';
import { dateRange, dayIndex, periodOf, round2, type Grain } from './production.service';
import type { ErpMeta, LogPeriod, LogSheetReport, SizeRow, SizeReport, OrderPeriod, OpenLine, OrdersReport, StockSize, StockReport } from '../../contracts';
export type { ErpMeta, LogPeriod, LogSheetReport, SizeRow, SizeReport, OrderPeriod, OpenLine, OrdersReport, StockSize, StockReport };

/** Two sums agree when they differ by no more than the ERP's own rounding. */
export const CHECK_TOLERANCE_MT = 0.05;

const meta = (cache: { syncedAt: string } | null, lastDate: string | null): ErpMeta => ({
  connection: cache ? 'up' : 'down',
  message: cache ? MSG.ERP_UP : MSG.ERP_NOT_SYNCED,
  syncedAt: cache?.syncedAt ?? null,
  lastDate,
});

const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));

/* ------------------------------- log sheet ------------------------------- */

type DayFields = Omit<LogPeriod, 'key' | 'label' | 'fromDate' | 'toDate' | 'days' | 'balanceOkDays' | 'qualityOkDays' | 'storesOkDays'>;
interface LogDay extends DayFields { date: string }

const SUMMED = [
  'inputMt', 'inputPcs', 'productionMt', 'productionPcs', 'primeMt', 'defectiveMt', 'rollingDefectMt',
  'burningLossMt', 'endCutMt', 'missRollMt', 'rejectMt', 'massDiffMt', 'storesMt',
  'balanceGapMt', 'qualityGapMt', 'storesGapMt',
] as const satisfies readonly (keyof DayFields)[];

const FIELD_OF: Record<Exclude<(typeof SUMMED)[number], 'massDiffMt' | 'storesMt' | 'balanceGapMt' | 'qualityGapMt' | 'storesGapMt'>, LogField> = {
  inputMt: 'INPUT_MT', inputPcs: 'INPUT_PCS', productionMt: 'PRODUCTION_MT', productionPcs: 'PRODUCTION_PCS',
  primeMt: 'PRIME_MT', defectiveMt: 'DEFECTIVE_MT', rollingDefectMt: 'ROLLING_DEFECT_MT',
  burningLossMt: 'BLOSS_MT', endCutMt: 'ENDCUT_MT', missRollMt: 'MISSROLL_MT', rejectMt: 'REJECT_MT',
};

/**
 * Per-day log-sheet sums. Pure. A voucher's missing field counts as 0 inside a day that
 * has entries (the ERP leaves unused attributes blank); a day with no voucher is all null.
 */
export function buildLogDays(
  dates: string[],
  rows: ErpProductionRow[],
  storesByDate: Map<string, number>,
): LogDay[] {
  const byDate = new Map<string, ErpProductionRow[]>();
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
  return dates.map((date) => {
    const vs = byDate.get(date) ?? [];
    const stores = storesByDate.has(date) ? round2(storesByDate.get(date)!) : null;
    const base = { date, entryDays: vs.length ? 1 : 0, entries: vs.length, storesMt: stores };
    if (!vs.length) {
      const nulls = Object.fromEntries(SUMMED.map((k) => [k, null])) as Record<(typeof SUMMED)[number], null>;
      return { ...nulls, ...base, yieldPct: null };
    }
    const f = (k: keyof typeof FIELD_OF) =>
      sum(vs.map((v) => (k === 'productionMt' ? v.mt ?? v.v?.PRODUCTION_MT : v.v?.[FIELD_OF[k]]) ?? 0));
    const input = f('inputMt');
    const prod = f('productionMt');
    const losses = { burningLossMt: f('burningLossMt'), endCutMt: f('endCutMt'), missRollMt: f('missRollMt'), rejectMt: f('rejectMt') };
    const quality = { primeMt: f('primeMt'), defectiveMt: f('defectiveMt'), rollingDefectMt: f('rollingDefectMt') };
    return {
      ...base,
      inputMt: input, inputPcs: f('inputPcs'), productionMt: prod, productionPcs: f('productionPcs'),
      ...quality, ...losses,
      massDiffMt: round2(input - prod),
      yieldPct: input > 0 ? round2((prod / input) * 100) : null,
      storesMt: stores ?? 0,
      balanceGapMt: round2(input - prod - Object.values(losses).reduce((a, b) => a + b, 0)),
      qualityGapMt: round2(prod - Object.values(quality).reduce((a, b) => a + b, 0)),
      storesGapMt: round2(prod - (stores ?? 0)),
    };
  });
}

export function summariseLog(key: string, label: string, days: LogDay[]): LogPeriod {
  const entered = days.filter((d) => d.entryDays);
  const out = {
    key, label, fromDate: days[0].date, toDate: days[days.length - 1].date, days: days.length,
    entryDays: entered.length,
    entries: days.reduce((a, d) => a + d.entries, 0),
  } as LogPeriod;
  for (const k of SUMMED) out[k] = entered.length ? sum(entered.map((d) => d[k] ?? 0)) : null;
  // Stores receipts can exist on a day the log sheet has not reached; they are still receipts.
  const stored = days.filter((d) => d.storesMt !== null);
  out.storesMt = stored.length ? sum(stored.map((d) => d.storesMt!)) : null;
  out.yieldPct = out.inputMt ? round2((out.productionMt! / out.inputMt) * 100) : null;
  const ok = (k: 'balanceGapMt' | 'qualityGapMt' | 'storesGapMt') =>
    entered.filter((d) => Math.abs(d[k] ?? 0) <= CHECK_TOLERANCE_MT).length;
  out.balanceOkDays = ok('balanceGapMt');
  out.qualityOkDays = ok('qualityGapMt');
  out.storesOkDays = ok('storesGapMt');
  return out;
}

function groupBy<T extends { date: string }>(days: T[], grain: Grain): { key: string; label: string; days: T[] }[] {
  const groups = new Map<string, { key: string; label: string; days: T[] }>();
  for (const d of days) {
    const p = periodOf(d.date, grain);
    const g = groups.get(p.key) ?? { ...p, days: [] };
    g.days.push(d);
    groups.set(p.key, g);
  }
  return [...groups.values()];
}

const isFinished = (item: string) => item.startsWith('F');

export function logSheetReport(env: Env, from: string, to: string, grain: Grain): LogSheetReport {
  const prod = readErpProduction(env);
  const com = readErpCommercial(env);
  const stores = new Map<string, number>();
  for (const l of com?.prodLines ?? []) {
    if (l.date >= from && l.date <= to && isFinished(l.item)) stores.set(l.date, (stores.get(l.date) ?? 0) + l.mt);
  }
  const rows = (prod?.rows ?? []).filter((r) => r.date >= from && r.date <= to);
  const days = buildLogDays(dateRange(from, to), rows, stores);
  return {
    from, to, grain,
    erp: meta(prod, prod?.rows.at(-1)?.date ?? null),
    rows: groupBy(days, grain).map((g) => summariseLog(g.key, g.label, g.days)),
    totals: summariseLog('total', 'Total', days),
  };
}

/* --------------------------------- sizes --------------------------------- */

export interface StripSpec { width: string; thickness: number | null; defective: boolean }

/** "MS STRIP (274 - 276 X 2.50) MM", "MS STRIP (184-186X1.6MM) DEFECTIVE" → spec; null if not a strip. */
export function parseStripSpec(name: string): StripSpec | null {
  const m = /\((\d+)\s*-\s*(\d+)\s*(?:X\s*([\d.]+))?/i.exec(name);
  if (!m) return null;
  const t = m[3] !== undefined ? Number(m[3]) : null;
  return { width: `${m[1]}–${m[2]}`, thickness: t !== null && Number.isFinite(t) ? t : null, defective: /defective/i.test(name) };
}

export function sizeReport(env: Env, from: string, to: string): SizeReport {
  const com = readErpCommercial(env);
  const names = com?.items ?? {};
  const rows = new Map<string, SizeRow>();
  const by = new Map<string, number>();
  const rowOf = (code: string): SizeRow | null => {
    const spec = parseStripSpec(names[code] ?? '');
    if (!spec || !isFinished(code)) return null;
    const t = spec.thickness === null ? '' : ` × ${spec.thickness.toFixed(2)}`;
    const key = `${spec.width}${t}${spec.defective ? ' D' : ''}`;
    const r = rows.get(key) ?? {
      key, label: `${spec.width}${t}${spec.defective ? ' · defective' : ''}`,
      ...spec, producedMt: 0, dispatchedMt: 0, dispatchedWithOrderMt: 0, items: [],
    };
    if (!r.items.some((i) => i.code === code)) r.items.push({ code, name: names[code] ?? code });
    rows.set(key, r);
    return r;
  };
  for (const l of com?.prodLines ?? []) {
    if (l.date < from || l.date > to) continue;
    const r = rowOf(l.item);
    if (r) r.producedMt += l.mt; else by.set(l.item, (by.get(l.item) ?? 0) + l.mt);
  }
  for (const s of com?.sales ?? []) {
    if (s.date < from || s.date > to) continue;
    const r = rowOf(s.item);
    if (!r) continue;
    r.dispatchedMt += s.mt;
    if (s.order) r.dispatchedWithOrderMt += s.mt;
  }
  const list = [...rows.values()]
    .map((r) => ({ ...r, producedMt: round2(r.producedMt), dispatchedMt: round2(r.dispatchedMt), dispatchedWithOrderMt: round2(r.dispatchedWithOrderMt) }))
    .sort((a, b) => (b.producedMt + b.dispatchedMt) - (a.producedMt + a.dispatchedMt) || a.key.localeCompare(b.key));
  return {
    from, to,
    erp: meta(com, com?.prodLines.at(-1)?.date ?? null),
    rows: list,
    totals: {
      producedMt: sum(list.map((r) => r.producedMt)),
      dispatchedMt: sum(list.map((r) => r.dispatchedMt)),
      dispatchedWithOrderMt: sum(list.map((r) => r.dispatchedWithOrderMt)),
    },
    byProducts: [...by].map(([code, mt]) => ({ code, name: names[code] ?? code, mt: round2(mt) })).sort((a, b) => b.mt - a.mt),
  };
}

/* --------------------------------- orders -------------------------------- */

export const AGE_BUCKETS = [
  { label: '0–7 days', max: 7 },
  { label: '8–30 days', max: 30 },
  { label: '31–90 days', max: 90 },
  { label: 'Over 90 days', max: Infinity },
] as const;

type OrderLine = ErpCommercialCache['orders'][number];
const pendingOf = (o: OrderLine) => Math.max(0, round2(o.qty - o.executed - o.cancelled));

function summariseOrders(key: string, label: string, fromDate: string, toDate: string, lines: OrderLine[]): OrderPeriod {
  return {
    key, label, fromDate, toDate, lines: lines.length,
    orderedMt: sum(lines.map((o) => o.qty)),
    executedMt: sum(lines.map((o) => o.executed)),
    cancelledMt: sum(lines.map((o) => o.cancelled)),
    pendingMt: sum(lines.map(pendingOf)),
  };
}

export function ordersReport(env: Env, from: string, to: string, grain: Grain, today: string): OrdersReport {
  const com = readErpCommercial(env);
  const orders = com?.orders ?? [];
  const names = com?.items ?? {};
  const clients = com?.clients ?? {};
  const sizeOf = (code: string) => {
    const s = parseStripSpec(names[code] ?? '');
    return s ? `${s.width}${s.thickness === null ? '' : ` × ${s.thickness.toFixed(2)}`}${s.defective ? ' · defective' : ''}` : names[code] ?? code;
  };

  const inRange = orders.filter((o) => o.date >= from && o.date <= to);
  const rows = groupBy(dateRange(from, to).map((date) => ({ date })), grain).map((g) => {
    const f = g.days[0].date;
    const t = g.days[g.days.length - 1].date;
    return summariseOrders(g.key, g.label, f, t, inRange.filter((o) => o.date >= f && o.date <= t));
  });

  const list: OpenLine[] = orders
    .filter((o) => pendingOf(o) > 0)
    .map((o) => ({
      orderNo: o.orderNo, line: o.line, date: o.date,
      client: clients[o.client] ?? o.client,
      size: sizeOf(o.item),
      qtyMt: o.qty, executedMt: o.executed, pendingMt: pendingOf(o),
      ageDays: Math.max(0, dayIndex(today) - dayIndex(o.date)),
      due: o.due,
      overdue: o.due !== null && o.due < today,
    }))
    .sort((a, b) => b.ageDays - a.ageDays || a.orderNo.localeCompare(b.orderNo) || a.line - b.line);

  const byClient = new Map<string, { lines: number; pendingMt: number }>();
  for (const l of list) {
    const c = byClient.get(l.client) ?? { lines: 0, pendingMt: 0 };
    c.lines += 1; c.pendingMt += l.pendingMt;
    byClient.set(l.client, c);
  }
  let lo = -1;
  const ages = AGE_BUCKETS.map((b) => {
    const inB = list.filter((l) => l.ageDays > lo && l.ageDays <= b.max);
    lo = b.max;
    return { label: b.label, lines: inB.length, pendingMt: sum(inB.map((l) => l.pendingMt)) };
  });
  const overdue = list.filter((l) => l.overdue);

  return {
    from, to, grain, asOf: today,
    erp: meta(com, orders.reduce<string | null>((m, o) => (m === null || o.date > m ? o.date : m), null)),
    rows,
    totals: summariseOrders('total', 'Total', from, to, inRange),
    open: {
      lines: list.length,
      pendingMt: sum(list.map((l) => l.pendingMt)),
      overdueLines: overdue.length,
      overdueMt: sum(overdue.map((l) => l.pendingMt)),
      ages,
      byClient: [...byClient].map(([client, c]) => ({ client, lines: c.lines, pendingMt: round2(c.pendingMt) })).sort((a, b) => b.pendingMt - a.pendingMt),
      list,
    },
  };
}

/* ---------------------------------- stock --------------------------------- */

/** ERP go-live for the strip mill: the stock ledger starts here. */
export const STOCK_LEDGER_START = '2025-11-30';

/** Financial year (1 Apr → 31 Mar) of a date, as the ERP labels it: "26-27". */
export function financialYear(date: string): { label: string; start: string } {
  const y = Number(date.slice(0, 4));
  const startYear = Number(date.slice(5, 7)) >= 4 ? y : y - 1;
  const yy = (n: number) => String(n % 100).padStart(2, '0');
  return { label: `${yy(startYear)}-${yy(startYear + 1)}`, start: `${startYear}-04-01` };
}

const MOVE_LABEL: Record<string, string> = {
  PROD: 'Production received', SALE: 'Dispatched (sales)', M2M: 'Item-to-item transfer', SRET: 'Sales returns',
};

export function stockReport(env: Env, asOf: string): StockReport {
  const com = readErpCommercial(env);
  const stock = com?.stock;
  const names = com?.items ?? {};
  const fy = financialYear(asOf);
  const openingRows = (stock?.openings ?? []).filter((o) => o.year === fy.label);
  const basis: StockReport['basis'] = openingRows.length
    ? { kind: 'opening', year: fy.label, from: fy.start }
    : { kind: 'ledger-start', year: fy.label, from: STOCK_LEDGER_START };

  const sizes = new Map<string, { opening: number; inMt: number; outMt: number }>();
  const at = (item: string) => {
    const s = sizes.get(item) ?? { opening: 0, inMt: 0, outMt: 0 };
    sizes.set(item, s);
    return s;
  };
  for (const o of openingRows) at(o.item).opening += o.mt;

  const byType = new Map<string, { inMt: number; outMt: number }>();
  const byDay = new Map<string, { inMt: number; outMt: number }>();
  for (const m of stock?.moves ?? []) {
    if (m.date < basis.from || m.date > asOf) continue;
    const s = at(m.item); s.inMt += m.inMt; s.outMt += m.outMt;
    const t = byType.get(m.type) ?? { inMt: 0, outMt: 0 }; t.inMt += m.inMt; t.outMt += m.outMt; byType.set(m.type, t);
    const d = byDay.get(m.date) ?? { inMt: 0, outMt: 0 }; d.inMt += m.inMt; d.outMt += m.outMt; byDay.set(m.date, d);
  }

  const rows: StockSize[] = [...sizes].map(([item, s]) => {
    const spec = parseStripSpec(names[item] ?? '');
    return {
      item,
      label: spec ? `${spec.width}${spec.thickness === null ? '' : ` × ${spec.thickness.toFixed(2)}`}` : names[item] ?? item,
      defective: spec?.defective ?? false,
      openingMt: round2(s.opening), inMt: round2(s.inMt), outMt: round2(s.outMt),
      stockMt: round2(s.opening + s.inMt - s.outMt),
    };
  }).sort((a, b) => b.stockMt - a.stockMt || a.label.localeCompare(b.label));

  const openingMt = sum(rows.map((r) => r.openingMt));
  let level = openingMt;
  const daily = dateRange(basis.from, asOf).map((date) => {
    const d = byDay.get(date) ?? { inMt: 0, outMt: 0 };
    level += d.inMt - d.outMt;
    return { date, inMt: round2(d.inMt), outMt: round2(d.outMt), stockMt: round2(level) };
  });
  const neg = rows.filter((r) => r.stockMt < -0.005);
  return {
    asOf,
    erp: meta(com, (stock?.moves ?? []).reduce<string | null>((m, x) => (m === null || x.date > m ? x.date : m), null)),
    basis,
    totals: {
      openingMt,
      inMt: sum(rows.map((r) => r.inMt)),
      outMt: sum(rows.map((r) => r.outMt)),
      stockMt: sum(rows.map((r) => r.stockMt)),
    },
    byType: [...byType].map(([type, t]) => ({ type, label: MOVE_LABEL[type] ?? type, inMt: round2(t.inMt), outMt: round2(t.outMt) }))
      .sort((a, b) => b.inMt + b.outMt - (a.inMt + a.outMt)),
    sizes: rows,
    negative: { sizes: neg.length, mt: sum(neg.map((r) => r.stockMt)) },
    daily,
  };
}
