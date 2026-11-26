/**
 * Power consumption from the IOsense logbook, for every mill. A day's figure is the SUM of
 * the kWh consumed over every entry the plant dated that day, all meters together. The
 * form's own date is used as entered: no 08:00 shift, no correction, so the dashboard shows
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
 *        Record" (rms-electrical-logbook/daily-power-consumption-record). The form as updated
 *        (the user, 26 Nov 2026), one entry a day: VCB-1 and VCB-2 actual kWh / kVAh, their total,
 *        the HSM share, crusher and colony, and `total-rms-actual-power-kwh` = total − the three —
 *        RMS's own power, the figure shown. An entry of the old form (to 22 Nov 2026) has
 *        `actual-kwh-vcb-1-1250amp` only: shown as it is, marked as a meter reading with no sharing.
 *        Specific energy is over PRIME production (PRIME_MT1 + PRIME_MT2), the days with both.
 *
 * An entry whose remark (any of the form's remarks boxes) says "test entry" is left out.
 *
 * Specific energy = that power ÷ the mill's ERP production for the same period, kWh/MT (the
 * user, 30 Oct 2026: ERP, never the Influx counter) — HSM's ERP log sheet (PRODUCTION_MT, L6P);
 * RMD's (PRODUCT_PRIME_SLENGTH_MT); LSM's
 * (PRODUTION_MT). Power is summed by the form's date, production by the 08:00
 * plant day — the same date, a few hours apart.
 *
 * Each request reads the mill's forms fresh from the logbook (one call per form, shared for
 * 30 s), so an entry the plant deletes or corrects there is gone or changed on the next
 * refresh. Entries are often typed days after their date, so the read takes everything
 * submitted from a month before the period.
 */
import type { Env } from '../../config/env';
import type { PowerDay, PowerEntry, PowerReport, RmdMode, RmsPowerSplit } from '../../contracts';
import { fetchFormsEntries, num, type InsightEntry } from '../../integrations/logbook/client';
import { MSG } from '../../shared/messages';
import { dateRange, plantDayStart, productionComparison, round2 } from '../hsm/production.service';
import { rmdLogRows, rmdProductionByDay, sumOf } from '../rmd/production.service';
import { readErpRmdProduction } from '../../integrations/erp/cache';
import { lsmProductionByDay } from '../lsm/production.service';
import { rmsPrimeByDay } from '../rms/production.service';

export type PowerMill = 'hsm' | 'rmd' | 'lsm' | 'rms';

/** How one logbook form becomes power entries: its mill, and the meter and kWh of a result. */
interface PowerForm {
  mill: PowerMill;
  read: (res: Record<string, unknown>) => Pick<PowerEntry, 'equipment' | 'previousReading' | 'presentReading' | 'kwh'> & { split?: SplitSums };
}

/** One RMS entry's figures, before the power factors are worked out. */
type SplitSums = Omit<RmsPowerSplit, 'pf1' | 'pf2' | 'pf'>;
const SPLIT_KEYS = ['vcb1Kwh', 'vcb2Kwh', 'vcb1Kvah', 'vcb2Kvah', 'totalKwh', 'hsmShareKwh', 'crusherKwh', 'colonyKwh', 'rmsKwh', 'meterOnlyKwh'] as const;
const addOrNull = (...xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? round2(v.reduce((a, b) => a + b, 0)) : null;
};
/** kWh ÷ kVAh, 3 dp; null without both. */
const pfOf = (kwh: number | null, kvah: number | null) => (kwh === null || !kvah ? null : Math.round((kwh / kvah) * 1000) / 1000);

/**
 * The RMS split of several entries (or days): every figure summed; a power factor = Σ kWh ÷ Σ kVAh over the entries
 * that have both for that meter, so an entry with kWh but no kVAh doesn't lift it.
 */
export function rmsSplitOf(parts: SplitSums[]): RmsPowerSplit {
  const sum = (k: (typeof SPLIT_KEYS)[number]) => addOrNull(...parts.map((p) => p[k]));
  const pair = (kwh: 'vcb1Kwh' | 'vcb2Kwh', kvah: 'vcb1Kvah' | 'vcb2Kvah') => parts.filter((p) => p[kwh] !== null && p[kvah]).map((p) => [p[kwh]!, p[kvah]!]);
  const one = pair('vcb1Kwh', 'vcb1Kvah');
  const two = pair('vcb2Kwh', 'vcb2Kvah');
  const tot = (ps: number[][], i: number) => (ps.length ? ps.reduce((a, p) => a + p[i], 0) : null);
  return {
    ...(Object.fromEntries(SPLIT_KEYS.map((k) => [k, sum(k)])) as SplitSums),
    pf1: pfOf(tot(one, 0), tot(one, 1)), pf2: pfOf(tot(two, 0), tot(two, 1)),
    pf: pfOf(tot([...one, ...two], 0), tot([...one, ...two], 1)),
  };
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
/**
 * RMS's Daily Power Consumption Record. The updated form (26 Nov 2026): two meters, the shares given away and RMS's
 * own power — the form's own totals are used as filed, worked out here only if left blank. The old form: VCB-1 only.
 */
const rmsRead: PowerForm['read'] = (res) => {
  if (!('vcb-1-actual-kwh' in res) && !('total-rms-actual-power-kwh' in res) && !('total-actual-kwh' in res)) {
    const old = vcb1250(res);
    return {
      ...old,
      split: {
        vcb1Kwh: old.kwh, vcb2Kwh: null, vcb1Kvah: num(res['actual-kvah-vcb-1-1250amp']), vcb2Kvah: null, totalKwh: old.kwh,
        hsmShareKwh: null, crusherKwh: null, colonyKwh: null, rmsKwh: null, meterOnlyKwh: old.kwh,
      },
    };
  }
  const vcb1Kwh = num(res['vcb-1-actual-kwh']);
  const vcb2Kwh = num(res['vcb-2-actual-kwh']);
  const totalKwh = num(res['total-actual-kwh']) ?? addOrNull(vcb1Kwh, vcb2Kwh);
  const hsmShareKwh = num(res['total-hsm-share-kwh']);
  const crusherKwh = num(res['total-crusher-kwh']);
  const colonyKwh = num(res['total-colony-kwh']);
  const rmsKwh = num(res['total-rms-actual-power-kwh'])
    ?? (totalKwh === null ? null : round2(totalKwh - (hsmShareKwh ?? 0) - (crusherKwh ?? 0) - (colonyKwh ?? 0)));
  return {
    equipment: 'RMS (VCB-1 + VCB-2 − shares)', previousReading: null, presentReading: null, kwh: rmsKwh,
    split: {
      vcb1Kwh, vcb2Kwh, vcb1Kvah: num(res['vcb-1-actual-kvah']), vcb2Kvah: num(res['vcb-2-actual-kvah']), totalKwh,
      hsmShareKwh, crusherKwh, colonyKwh, rmsKwh, meterOnlyKwh: null,
    },
  };
};
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
  ['rms-electrical-logbook/daily-power-consumption-record', { mill: 'rms', read: rmsRead }],
]);
const formsOf = (mill: PowerMill) => [...FORMS].filter(([, f]) => f.mill === mill).map(([tag]) => tag);

const DAY_MS = 86_400_000;

/** kWh per tonne; null without both figures or without production. */
export const specificEnergy = (kwh: number | null, mt: number | null) => (kwh === null || !mt ? null : round2(kwh / mt));
/** Entries typed up to a month after their date are counted. */
const LOOK_BACK_MS = 31 * DAY_MS;
/** How far back to look for the last entry when the period and its month before have none. */
const LAST_ENTRY_LOOK_BACK_MS = 183 * DAY_MS;

type Row = PowerEntry & { createdMs: number; split?: SplitSums };

function toRow(r: InsightEntry): Row | null {
  const tag = String((r.tags ?? [])[0] ?? r.resultName ?? '');
  const form = FORMS.get(tag);
  if (!form) return null;
  const res = r.result ?? {};
  // A test entry is not a reading.
  if (Object.entries(res).some(([k, v]) => /remarks$/.test(k) && /test\s*entry/i.test(String(v ?? '')))) return null;
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

async function report(env: Env, mill: PowerMill, from: string, to: string, nowMs: number, production: Promise<Production | null>, paired = false): Promise<PowerReport> {
  const dates = dateRange(from, to);
  const base = { from, to, form: formsOf(mill).join(', ') };
  if (!env.logbookInsightId) {
    return {
      ...base, logbook: { connection: 'down', message: MSG.LOGBOOK_NOT_MAPPED, readSince: null }, equipment: [],
      days: dates.map((date) => ({ date, kwh: null, entries: 0, byEquipment: {}, productionMt: null, kwhPerMt: null })),
      totals: { kwh: null, entries: 0, byEquipment: {}, productionMt: null, kwhPerMt: null }, entries: [], lastDate: null,
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
    const splits = es.map((e) => e.split).filter((x): x is SplitSums => !!x);
    return { date, kwh, entries: es.length, byEquipment, productionMt, kwhPerMt: specificEnergy(kwh, productionMt), ...(mill === 'rms' ? { rms: rmsSplitOf(splits) } : {}) };
  });
  const byEquipment: Record<string, number> = {};
  for (const d of days) for (const [k, v] of Object.entries(d.byEquipment)) byEquipment[k] = round2((byEquipment[k] ?? 0) + v);
  /* The last day with a reading, up to the period end — from what was read, else once more further back. */
  const latest = (rs: Row[]) => rs.filter((e) => e.kwh !== null && e.date && e.date <= to).reduce<string | null>((a, e) => (a === null || e.date > a ? e.date : a), null);
  let lastDate = latest(rows);
  if (lastDate === null && read.ok) {
    const older = await fetchFormsEntries(formsOf(mill), plantDayStart(from) - LAST_ENTRY_LOOK_BACK_MS, env, nowMs).catch(() => null);
    if (older?.ok) lastDate = latest(older.rows.map(toRow).filter((r): r is Row => r !== null));
  }
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
      const rms = mill === 'rms' ? { rms: rmsSplitOf(inRange.map((e) => e.split).filter((x): x is SplitSums => !!x)) } : {};
      if (paired) {
        // Σ power ÷ Σ production over the days that have both, so a day without one of them doesn't bend the figure.
        const both = days.filter((d) => d.kwh !== null && d.productionMt);
        const pairedKwh = both.length ? round2(both.reduce((a, d) => a + d.kwh!, 0)) : null;
        const productionMt = both.length ? round2(both.reduce((a, d) => a + d.productionMt!, 0)) : null;
        return { kwh, entries: inRange.length, byEquipment, productionMt, kwhPerMt: specificEnergy(pairedKwh, productionMt), pairedKwh, ...rms };
      }
      const productionMt = prod?.total ?? null;
      return { kwh, entries: inRange.length, byEquipment, productionMt, kwhPerMt: specificEnergy(kwh, productionMt), ...rms };
    })(),
    entries: inRange
      .sort((a, b) => (a.date === b.date ? b.createdMs - a.createdMs : b.date.localeCompare(a.date)))
      .map(({ createdMs: _c, split: _s, ...e }) => e),
    lastDate,
  };
}

/** HSM: the logbook's power over the ERP log sheet's production (PRODUCTION_MT, L6P). */
export function powerReport(env: Env, from: string, to: string, nowMs = Date.now()): Promise<PowerReport> {
  const production = productionComparison(env, from, to, 'day', nowMs).then((p) => ({
    byDay: new Map(p.days.map((d) => [d.date, d.erpMt])),
    total: p.totals.erpMt,
  }));
  return report(env, 'hsm', from, to, nowMs, production);
}

/**
 * RMD: the three VCB forms, over the ERP log sheet's production (PRODUCT_PRIME_SLENGTH_MT).
 * Online / Offline: the meters can't tell the two apart, so power is that rolling's
 * TOTAL_POWER_CONSUMPTION from the same ERP entries (the user, 13 Nov 2026).
 */
export function rmdPowerReport(env: Env, from: string, to: string, nowMs = Date.now(), mode: RmdMode = 'all'): Promise<PowerReport> {
  if (mode !== 'all') return Promise.resolve(rmdErpPowerReport(env, from, to, mode));
  const byDay = rmdProductionByDay(env, dateRange(from, to));
  const vals = [...byDay.values()].filter((v): v is number => v !== null);
  const production = Promise.resolve({ byDay, total: vals.length ? round2(vals.reduce((a, b) => a + b, 0)) : null });
  return report(env, 'rmd', from, to, nowMs, production);
}

const ERP_METER = 'ERP log sheet';

/** RMD Online / Offline power: the ERP log sheet entries of that rolling, shaped as the logbook report. */
function rmdErpPowerReport(env: Env, from: string, to: string, mode: 'online' | 'offline'): PowerReport {
  const cache = readErpRmdProduction(env);
  const rows = rmdLogRows(env, mode);
  const inRange = rows.filter((r) => r.date >= from && r.date <= to);
  const days: PowerDay[] = dateRange(from, to).map((date) => {
    const es = inRange.filter((r) => r.date === date);
    const kwh = sumOf(es, 'TOTAL_POWER_CONSUMPTION');
    const productionMt = sumOf(es, 'PRODUCT_PRIME_SLENGTH_MT');
    const entries = es.filter((r) => typeof r.v.TOTAL_POWER_CONSUMPTION === 'number').length;
    const byEquipment: Record<string, number> = kwh === null ? {} : { [ERP_METER]: kwh };
    return { date, kwh, entries, byEquipment, productionMt, kwhPerMt: specificEnergy(kwh, productionMt) };
  });
  // Σ power ÷ Σ production over the days that have both, so a day without power doesn't lower it.
  const both = days.filter((d) => d.kwh !== null && d.productionMt);
  const kwh = both.length ? round2(both.reduce((a, d) => a + d.kwh!, 0)) : null;
  const productionMt = both.length ? round2(both.reduce((a, d) => a + d.productionMt!, 0)) : null;
  const entries = inRange.filter((r) => typeof r.v.TOTAL_POWER_CONSUMPTION === 'number');
  return {
    from, to, form: 'ERP log sheet · TOTAL_POWER_CONSUMPTION', erpMode: mode,
    logbook: { connection: cache ? 'up' : 'down', message: cache ? MSG.ERP_UP : MSG.ERP_NOT_SYNCED, readSince: null },
    equipment: entries.length ? [ERP_METER] : [],
    days,
    totals: { kwh, entries: entries.length, byEquipment: kwh === null ? {} as Record<string, number> : { [ERP_METER]: kwh }, productionMt, kwhPerMt: specificEnergy(kwh, productionMt) },
    entries: [...entries].reverse().map((r) => ({
      date: r.date, shift: '', equipment: ERP_METER, previousReading: null, presentReading: null,
      kwh: r.v.TOTAL_POWER_CONSUMPTION, enteredAt: null,
    })),
    lastDate: rows.filter((r) => r.date <= to && typeof r.v.TOTAL_POWER_CONSUMPTION === 'number').at(-1)?.date ?? null,
  };
}

/** LSM: the daily power consumption record, over the ERP log sheet's production (PRODUTION_MT). */
export function lsmPowerReport(env: Env, from: string, to: string, nowMs = Date.now()): Promise<PowerReport> {
  const byDay = lsmProductionByDay(env, dateRange(from, to));
  const vals = [...byDay.values()].filter((v): v is number => v !== null);
  const production = Promise.resolve({ byDay, total: vals.length ? round2(vals.reduce((a, b) => a + b, 0)) : null });
  return report(env, 'lsm', from, to, nowMs, production);
}

/**
 * RMS: the RMS Daily Power Consumption Record — RMS's own power — over the ERP log sheet's PRIME production
 * (PRIME_MT1 + PRIME_MT2), the days with both (the user, 26 Nov 2026).
 */
export async function rmsPowerReport(env: Env, from: string, to: string, nowMs = Date.now()): Promise<PowerReport> {
  const byDay = rmsPrimeByDay(env, dateRange(from, to));
  const vals = [...byDay.values()].filter((v): v is number => v !== null);
  const production = Promise.resolve({ byDay, total: vals.length ? round2(vals.reduce((a, b) => a + b, 0)) : null });
  return { ...(await report(env, 'rms', from, to, nowMs, production, true)), basis: 'prime' };
}
