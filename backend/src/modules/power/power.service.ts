/**
 * Power consumption from the IOsense logbook, for every mill. A day's figure is the SUM of
 * the kWh consumed over every entry the plant dated that day, all meters together. The
 * form's own date is used as entered: no 06:00 shift, no correction, so the dashboard shows
 * exactly what is being filled in.
 *
 *   HSM  one form, "Electrical HSM → Power Consumption" (electrical-hsm/power-consumption):
 *        one entry per meter, `power-consumed` (kWh), the meter in `equipment`.
 *   RMD  one form per meter, "TMT Electrical Department → Power Reading VCB 1 / 2 / 3"
 *        (tmt-electrical-department/power-reading-vcb-n): `actual-kwh-vcb-n` (kWh).
 *   LSM  "Electrical Logbook → Daily Power Consumption Record", filled hourly
 *        (electrical-logbook/daily-power-consumption-record): `actual-kwh-vcb-1-1250amp`
 *        (kWh) = present − previous reading, as the plant gave it (13 Oct 2026).
 *   RMS  "Rolling Mill Structure (RMS) → RMS Electrical Logbook → Daily Power Consumption
 *        Record" (rms-electrical-logbook/daily-power-consumption-record): the same fields as
 *        LSM's, `actual-kwh-vcb-1-1250amp` (kWh) (the user, 17 Oct 2026).
 *
 * An entry whose remark says "test entry" is left out.
 *
 * Specific energy = that power ÷ the mill's production for the same period, kWh/MT — HSM's
 * Production card (the Influx counter); RMD's ERP log sheet (PRODUCT_PRIME_SLENGTH_MT); LSM's
 * (PRODUTION_MT). Power is summed by the form's date, production by the 06:00
 * plant day — the same date, a few hours apart.
 *
 * Each request reads the mill's forms fresh from the logbook (one call per form, shared for
 * 30 s), so an entry the plant deletes or corrects there is gone or changed on the next
 * refresh. Entries are often typed days after their date, so the read takes everything
 * submitted from a month before the period.
 */
import type { Env } from '../../config/env';
import type { PowerDay, PowerEntry, PowerReport } from '../../contracts';
import { fetchFormsEntries, num, type InsightEntry } from '../../integrations/logbook/client';
import { MSG } from '../../shared/messages';
import { dateRange, plantDayStart, productionComparison, round2 } from '../hsm/production.service';
import { rmdProductionByDay } from '../rmd/production.service';
import { lsmProductionByDay } from '../lsm/production.service';
import { rmsProductionByDay } from '../rms/production.service';

export type PowerMill = 'hsm' | 'rmd' | 'lsm' | 'rms';

/** How one logbook form becomes power entries: its mill, and the meter and kWh of a result. */
interface PowerForm {
  mill: PowerMill;
  read: (res: Record<string, unknown>) => Pick<PowerEntry, 'equipment' | 'previousReading' | 'presentReading' | 'kwh'>;
}

export const POWER_FORM = 'electrical-hsm/power-consumption';
const vcb = (n: number): [string, PowerForm] => [`tmt-electrical-department/power-reading-vcb-${n}`, {
  mill: 'rmd',
  read: (res) => ({
    equipment: `VCB ${n}`,
    previousReading: num(res[`previous-kwh-vcb-${n}`]),
    presentReading: num(res[`present-kwh-vcb-${n}`]),
    kwh: num(res[`actual-kwh-vcb-${n}`]),
  }),
}];
/** LSM's and RMS's Daily Power Consumption Record: one meter, VCB-1 (1250 A). */
const vcb1250: PowerForm['read'] = (res) => ({
  equipment: 'VCB-1 (1250 A)',
  previousReading: num(res['previous-kwh-vcb-1-1250amp']),
  presentReading: num(res['present-kwh-vcb-1-1250amp']),
  kwh: num(res['actual-kwh-vcb-1-1250amp']),
});
/** Every power form, by its logbook tag. */
const FORMS = new Map<string, PowerForm>([
  [POWER_FORM, {
    mill: 'hsm',
    read: (res) => ({
      equipment: String(res['equipment'] ?? '').trim() || 'Meter not filled',
      previousReading: num(res['previous-meter-reading']),
      presentReading: num(res['present-meter-reading']),
      kwh: num(res['power-consumed']),
    }),
  }],
  vcb(1), vcb(2), vcb(3),
  ['electrical-logbook/daily-power-consumption-record', { mill: 'lsm', read: vcb1250 }],
  ['rms-electrical-logbook/daily-power-consumption-record', { mill: 'rms', read: vcb1250 }],
]);
const formsOf = (mill: PowerMill) => [...FORMS].filter(([, f]) => f.mill === mill).map(([tag]) => tag);

const DAY_MS = 86_400_000;

/** kWh per tonne; null without both figures or without production. */
export const specificEnergy = (kwh: number | null, mt: number | null) => (kwh === null || !mt ? null : round2(kwh / mt));
/** Entries typed up to a month after their date are counted. */
const LOOK_BACK_MS = 31 * DAY_MS;

type Row = PowerEntry & { createdMs: number };

function toRow(r: InsightEntry): Row | null {
  const tag = String((r.tags ?? [])[0] ?? r.resultName ?? '');
  const form = FORMS.get(tag);
  if (!form) return null;
  const res = r.result ?? {};
  // A test entry is not a reading.
  if (/test\s*entry/i.test(String(res['remarks'] ?? ''))) return null;
  const createdMs = Date.parse(r.createdAt ?? r.invocationTime ?? '');
  return {
    date: String(res['date'] ?? '').slice(0, 10),
    shift: String(res['shift'] ?? ''),
    ...form.read(res),
    enteredAt: r.createdAt ?? r.invocationTime ?? null,
    createdMs: Number.isFinite(createdMs) ? createdMs : 0,
  };
}

/** Production per plant date and in total, MT — what specific energy divides by. */
interface Production { byDay: Map<string, number | null>; total: number | null }

async function report(env: Env, mill: PowerMill, from: string, to: string, nowMs: number, production: Promise<Production | null>): Promise<PowerReport> {
  const dates = dateRange(from, to);
  const base = { from, to, form: formsOf(mill).join(', ') };
  if (!env.logbookInsightId) {
    return {
      ...base, logbook: { connection: 'down', message: MSG.LOGBOOK_NOT_MAPPED, readSince: null }, equipment: [],
      days: dates.map((date) => ({ date, kwh: null, entries: 0, byEquipment: {}, productionMt: null, kwhPerMt: null })),
      totals: { kwh: null, entries: 0, byEquipment: {}, productionMt: null, kwhPerMt: null }, entries: [],
    };
  }
  const sinceMs = plantDayStart(from) - LOOK_BACK_MS;
  const [prod, read] = await Promise.all([production.catch(() => null), fetchFormsEntries(formsOf(mill), sinceMs, env, nowMs)]);

  const rows = read.ok ? read.rows.map(toRow).filter((r): r is Row => r !== null) : [];
  const inRange = rows.filter((e) => e.date >= from && e.date <= to);
  // The meters that have entries in this period — a blank meter name shows as its own column only if filled that way here.
  const equipment = [...new Set(inRange.map((e) => e.equipment))].sort();
  const days: PowerDay[] = dates.map((date) => {
    const es = inRange.filter((e) => e.date === date);
    const byEquipment: Record<string, number> = {};
    for (const e of es) byEquipment[e.equipment] = round2((byEquipment[e.equipment] ?? 0) + (e.kwh ?? 0));
    const vals = es.map((e) => e.kwh).filter((v): v is number => v !== null);
    const kwh = vals.length ? round2(vals.reduce((a, b) => a + b, 0)) : null;
    const productionMt = prod?.byDay.get(date) ?? null;
    return { date, kwh, entries: es.length, byEquipment, productionMt, kwhPerMt: specificEnergy(kwh, productionMt) };
  });
  const byEquipment: Record<string, number> = {};
  for (const d of days) for (const [k, v] of Object.entries(d.byEquipment)) byEquipment[k] = round2((byEquipment[k] ?? 0) + v);
  const withKwh = days.filter((d) => d.kwh !== null);
  return {
    ...base,
    logbook: {
      connection: read.ok ? 'up' : 'down', message: read.ok ? MSG.LOGBOOK_UP : read.message,
      readSince: read.ok ? new Date(sinceMs).toISOString() : null,
    },
    equipment,
    days,
    totals: (() => {
      const kwh = withKwh.length ? round2(withKwh.reduce((a, d) => a + d.kwh!, 0)) : null;
      const productionMt = prod?.total ?? null;
      return { kwh, entries: inRange.length, byEquipment, productionMt, kwhPerMt: specificEnergy(kwh, productionMt) };
    })(),
    entries: inRange
      .sort((a, b) => (a.date === b.date ? b.createdMs - a.createdMs : b.date.localeCompare(a.date)))
      .map(({ createdMs: _c, ...e }) => e),
  };
}

/** HSM: the logbook's power over the Production card's Influx figure. */
export function powerReport(env: Env, from: string, to: string, nowMs = Date.now()): Promise<PowerReport> {
  const production = productionComparison(env, from, to, 'day', nowMs).then((p) => ({
    byDay: new Map(p.days.map((d) => [d.date, d.influxMt])),
    total: p.totals.influxMt,
  }));
  return report(env, 'hsm', from, to, nowMs, production);
}

/** RMD: the three VCB forms, over the ERP log sheet's production (PRODUCT_PRIME_SLENGTH_MT). */
export function rmdPowerReport(env: Env, from: string, to: string, nowMs = Date.now()): Promise<PowerReport> {
  const byDay = rmdProductionByDay(env, dateRange(from, to));
  const vals = [...byDay.values()].filter((v): v is number => v !== null);
  const production = Promise.resolve({ byDay, total: vals.length ? round2(vals.reduce((a, b) => a + b, 0)) : null });
  return report(env, 'rmd', from, to, nowMs, production);
}

/** LSM: the daily power consumption record, over the ERP log sheet's production (PRODUTION_MT). */
export function lsmPowerReport(env: Env, from: string, to: string, nowMs = Date.now()): Promise<PowerReport> {
  const byDay = lsmProductionByDay(env, dateRange(from, to));
  const vals = [...byDay.values()].filter((v): v is number => v !== null);
  const production = Promise.resolve({ byDay, total: vals.length ? round2(vals.reduce((a, b) => a + b, 0)) : null });
  return report(env, 'lsm', from, to, nowMs, production);
}

/** RMS: the RMS Daily Power Consumption Record, over the ERP log sheet's production (PRODUCTION_MT). */
export function rmsPowerReport(env: Env, from: string, to: string, nowMs = Date.now()): Promise<PowerReport> {
  const byDay = rmsProductionByDay(env, dateRange(from, to));
  const vals = [...byDay.values()].filter((v): v is number => v !== null);
  const production = Promise.resolve({ byDay, total: vals.length ? round2(vals.reduce((a, b) => a + b, 0)) : null });
  return report(env, 'rms', from, to, nowMs, production);
}
