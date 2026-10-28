/**
 * ERP PM for the Asset Health screens, from the PM cache (erp/sync.ts pullPm) — the plant's tables
 * (28 Oct 2026), whole mill: the ERP marks no section or stand on its equipment. Definitions as the
 * plant's HSM KPI sheet:
 *   PM on time     100 × PM tasks closed by their due date ÷ PM tasks due in the period (up to
 *                  yesterday — PM due today can still be done today);
 *   Next PM        the first date from today with PM not yet done;
 *   MTTR           breakdown hours ÷ breakdowns in the period (MTBF = running hours ÷ the same
 *                  breakdowns, on the screen, with its own running hours);
 *   Open work orders  raised up to the period end, neither closed nor cancelled;
 *   Open action    open corrective work: breakdowns reported up to the period end, not closed.
 * Breakdowns remarked "test" are left out.
 */
import type { Env } from '../../config/env';
import type { PmBreakdown, PmMonth, PmReport } from '../../contracts';
import { readErpPm, type ErpPmBreakdown, type PmMill } from '../../integrations/erp/cache';
import { MSG } from '../../shared/messages';
import { round2 } from '../hsm/production.service';

const IST_MS = 330 * 60_000;
const istToday = () => new Date(Date.now() + IST_MS).toISOString().slice(0, 10);
const isTest = (b: ErpPmBreakdown) => (b.remark ?? '').trim().toLowerCase() === 'test';
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function pmReport(env: Env, mill: PmMill, from: string, to: string, today = istToday()): PmReport {
  const cache = readErpPm(env);
  // PM due today can still be done today: counted from tomorrow.
  const asOf = to < today ? to : addDays(today, -1);
  const days = (cache?.days ?? []).filter((d) => d.mill === mill);
  const inPeriod = days.filter((d) => d.date >= from && d.date <= asOf);
  const sum = (k: 'due' | 'done' | 'doneOnTime') => inPeriod.reduce((a, d) => a + d[k], 0);
  const due = sum('due');
  const doneOnTime = sum('doneOnTime');

  const months = new Map<string, PmMonth>();
  for (const d of inPeriod) {
    const m = months.get(d.date.slice(0, 7)) ?? { month: d.date.slice(0, 7), due: 0, doneOnTime: 0, doneLate: 0, open: 0 };
    m.due += d.due;
    m.doneOnTime += d.doneOnTime;
    m.doneLate += d.done - d.doneOnTime;
    m.open += d.due - d.done;
    months.set(m.month, m);
  }
  const next = days.find((d) => d.date >= today && d.due > d.done);

  const all = (cache?.breakdowns ?? []).filter((b) => b.mill === mill && !isTest(b));
  const breakdowns: PmBreakdown[] = all
    .filter((b) => b.from.slice(0, 10) >= from && b.from.slice(0, 10) <= to)
    .map(({ mill: _, ...b }) => b);
  const hours = breakdowns.map((b) => b.hours).filter((h): h is number => h !== null);
  const breakdownHours = hours.length ? round2(hours.reduce((a, b) => a + b, 0)) : null;

  return {
    mill, from, to,
    erp: { connection: cache ? 'up' : 'down', message: cache ? MSG.ERP_UP : MSG.ERP_NOT_SYNCED, syncedAt: cache?.syncedAt ?? null },
    equipment: cache?.equipment[mill] ?? 0,
    pm: { asOf, due, done: sum('done'), doneOnTime, onTimePct: due ? round2((100 * doneOnTime) / due) : null },
    months: [...months.values()],
    nextPm: next ? { date: next.date, count: next.due - next.done } : null,
    breakdowns,
    breakdownHours,
    mttrH: breakdowns.length && breakdownHours !== null ? round2(breakdownHours / breakdowns.length) : null,
    openWorkOrders: (cache?.workOrders ?? []).filter((w) => w.mill === mill && w.date <= to && !w.closed && !w.cancelled).length,
    openActions: all.filter((b) => b.from.slice(0, 10) <= to && !b.closed).length,
  };
}
