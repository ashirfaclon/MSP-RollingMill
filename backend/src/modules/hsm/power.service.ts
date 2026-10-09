/**
 * HSM power consumption, from the IOsense logbook form "Electrical HSM → Power Consumption"
 * (form `electrical-hsm/power-consumption`). A day's figure is the SUM of `power-consumed`
 * (kWh) over every entry the plant dated that day — all meters (roughing, finishing, billet
 * heater …). The form's own date is used as entered: no 06:00 shift, no correction, so the
 * dashboard shows exactly what is being filled in.
 *
 * Specific energy = that power ÷ the Production card's Total (Influx counter, reset events
 * less noise) for the same period, kWh/MT. Power is summed by the form's date, production by
 * the 06:00 plant day — the same date, a few hours apart.
 *
 * The logbook engine ignores filters and returns every form's entries newest first, so an
 * in-memory index of this form's entries is kept: topped up from the newest page every few
 * minutes, and extended further back only when a period needs older entries. Entries are
 * often typed days after their date, so reading starts a week before the period.
 */
import type { Env } from '../../config/env';
import type { PowerDay, PowerEntry, PowerReport } from '../../contracts';
import { fetchInsightPage, num, type InsightEntry } from '../../integrations/logbook/client';
import { MSG } from '../../shared/messages';
import { dateRange, plantDayStart, productionComparison, round2 } from './production.service';

export const POWER_FORM = 'electrical-hsm/power-consumption';
const DAY_MS = 86_400_000;

/** kWh per tonne; null without both figures or without production. */
export const specificEnergy = (kwh: number | null, mt: number | null) => (kwh === null || !mt ? null : round2(kwh / mt));
/** Entries typed up to a week after their date are counted. */
const ENTRY_LAG_MS = 7 * DAY_MS;
const TOP_UP_MS = 3 * 60_000;
const MAX_PAGES = 200;

interface Index {
  rows: Map<string, PowerEntry & { createdMs: number }>;
  /** Oldest submission time the scan has reached. */
  reachedMs: number;
  newestMs: number;
  toppedAt: number;
  message: string;
  up: boolean;
}
const idx: Index = { rows: new Map(), reachedMs: Infinity, newestMs: 0, toppedAt: 0, message: MSG.LOGBOOK_NOT_MAPPED, up: false };
let pending: Promise<void> | null = null;

function keep(r: InsightEntry) {
  if ((r.tags ?? [])[0] !== POWER_FORM && r.resultName !== POWER_FORM) return;
  const res = r.result ?? {};
  const createdMs = Date.parse(r.createdAt ?? r.invocationTime ?? '');
  const id = r._id ?? `${r.createdAt}|${res['equipment']}|${res['previous-meter-reading']}`;
  idx.rows.set(id, {
    date: String(res['date'] ?? '').slice(0, 10),
    shift: String(res['shift'] ?? ''),
    equipment: String(res['equipment'] ?? '').trim() || 'Meter not filled',
    previousReading: num(res['previous-meter-reading']),
    presentReading: num(res['present-meter-reading']),
    kwh: num(res['power-consumed']),
    enteredAt: r.createdAt ?? r.invocationTime ?? null,
    createdMs: Number.isFinite(createdMs) ? createdMs : 0,
  });
}

/** Page from the newest entry back until `stopMs` (submission time), indexing this form's rows. */
async function scan(env: Env, stopMs: number, topUpOnly: boolean) {
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const p = await fetchInsightPage(page, env);
    if (!p.ok) { idx.up = false; idx.message = p.message; return; }
    idx.up = true; idx.message = MSG.LOGBOOK_UP;
    for (const r of p.rows) keep(r);
    const times = p.rows.map((r) => Date.parse(r.createdAt ?? r.invocationTime ?? '')).filter(Number.isFinite);
    const oldest = times.length ? Math.min(...times) : -Infinity;
    if (times.length) idx.newestMs = Math.max(idx.newestMs, ...times);
    if (!topUpOnly) idx.reachedMs = Math.min(idx.reachedMs, oldest);
    if (p.rows.length === 0 || oldest < stopMs) return;
  }
}

/** Make sure the index covers submissions back to `sinceMs` and is recent. */
async function ensure(env: Env, sinceMs: number, nowMs: number) {
  while (pending) await pending;
  const needBack = idx.reachedMs > sinceMs;
  const stale = nowMs - idx.toppedAt > TOP_UP_MS;
  if (!needBack && !stale) return;
  pending = (async () => {
    if (needBack) await scan(env, sinceMs, false);
    else await scan(env, idx.newestMs - 6 * 3_600_000, true);   // re-read the last hours: late edits
    idx.toppedAt = Date.now();
  })();
  try { await pending; } finally { pending = null; }
}

export async function powerReport(env: Env, from: string, to: string, nowMs = Date.now()): Promise<PowerReport> {
  const dates = dateRange(from, to);
  const base = { from, to, form: POWER_FORM };
  if (!env.logbookInsightId) {
    return {
      ...base, logbook: { connection: 'down', message: MSG.LOGBOOK_NOT_MAPPED, readSince: null }, equipment: [],
      days: dates.map((date) => ({ date, kwh: null, entries: 0, byEquipment: {}, productionMt: null, kwhPerMt: null })),
      totals: { kwh: null, entries: 0, byEquipment: {}, productionMt: null, kwhPerMt: null }, entries: [],
    };
  }
  const [prod] = await Promise.all([
    productionComparison(env, from, to, 'day', nowMs).catch(() => null),
    ensure(env, plantDayStart(from) - ENTRY_LAG_MS, nowMs),
  ]);
  const prodByDay = new Map((prod?.days ?? []).map((d) => [d.date, d.influxMt]));

  const inRange = [...idx.rows.values()].filter((e) => e.date >= from && e.date <= to);
  // The meters that have entries in this period — a blank meter name shows as its own column only if filled that way here.
  const equipment = [...new Set(inRange.map((e) => e.equipment))].sort();
  const days: PowerDay[] = dates.map((date) => {
    const es = inRange.filter((e) => e.date === date);
    const byEquipment: Record<string, number> = {};
    for (const e of es) byEquipment[e.equipment] = round2((byEquipment[e.equipment] ?? 0) + (e.kwh ?? 0));
    const vals = es.map((e) => e.kwh).filter((v): v is number => v !== null);
    const kwh = vals.length ? round2(vals.reduce((a, b) => a + b, 0)) : null;
    const productionMt = prodByDay.get(date) ?? null;
    return { date, kwh, entries: es.length, byEquipment, productionMt, kwhPerMt: specificEnergy(kwh, productionMt) };
  });
  const byEquipment: Record<string, number> = {};
  for (const d of days) for (const [k, v] of Object.entries(d.byEquipment)) byEquipment[k] = round2((byEquipment[k] ?? 0) + v);
  const withKwh = days.filter((d) => d.kwh !== null);
  return {
    ...base,
    logbook: {
      connection: idx.up ? 'up' : 'down', message: idx.message,
      readSince: Number.isFinite(idx.reachedMs) ? new Date(idx.reachedMs).toISOString() : null,
    },
    equipment,
    days,
    totals: (() => {
      const kwh = withKwh.length ? round2(withKwh.reduce((a, d) => a + d.kwh!, 0)) : null;
      const productionMt = prod?.totals.influxMt ?? null;
      return { kwh, entries: inRange.length, byEquipment, productionMt, kwhPerMt: specificEnergy(kwh, productionMt) };
    })(),
    entries: inRange
      .sort((a, b) => (a.date === b.date ? b.createdMs - a.createdMs : b.date.localeCompare(a.date)))
      .map(({ createdMs: _c, ...e }) => e),
  };
}

/**
 * Read the last few weeks into the index at startup, so the first person to open the
 * dashboard does not wait for it. Fire and forget: a failure is retried on the next request.
 */
export function warmPowerIndex(env: Env, days = 45): void {
  if (!env.logbookInsightId) return;
  void ensure(env, Date.now() - days * DAY_MS, Date.now()).catch(() => undefined);
}

/** Tests only. */
export function resetPowerIndex() {
  idx.rows.clear(); idx.reachedMs = Infinity; idx.newestMs = 0; idx.toppedAt = 0; idx.up = false; idx.message = MSG.LOGBOOK_NOT_MAPPED;
}
