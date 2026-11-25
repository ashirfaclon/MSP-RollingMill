/**
 * HSM Asset Health's Bearing temp and Oil temp (the user, 25 Nov 2026) from the logbook's "HSM Mechanical →
 * Bearing Temperature Details" (hsm-mechanical/bearing-temperature-details). One entry is one round of the
 * whole mill, as the plant's sheet:
 *   bearings  the reduction-cum-pinion gearbox of RM 1–5, VE 1 (non-operator and operator side) and FM 1–6,
 *             D side and ND side, °C (`rm-stand-1-d-side-c`, `ve-1-n-os-nd-side-c`, `fm-6-d-side-c` …);
 *   oil       lubrication tanks 1–4, °C (`lubrication-tank-1-c` …) — tank 1 R1 & R2, 2 R3, R4 & R5 (roughing),
 *             3 F1–F3, 4 F4–F6 (finishing).
 * The form's own averages are not read: the screen shows the hottest. An entry remarked "test" is left out.
 * Read fresh from the logbook; submissions from a month before the period, placed by the form's Date.
 */
import type { Env } from '../../config/env';
import type { HsmBearingEntry, HsmBearingReport, HsmGearBearing, HsmLatestBearing, HsmLatestTank, HsmOilTank } from '../../contracts';
import { fetchFormEntries, num, type InsightEntry } from '../../integrations/logbook/client';
import { MSG } from '../../shared/messages';

export const BEARING_FORM = 'hsm-mechanical/bearing-temperature-details';
const LOOK_BACK_MS = 31 * 86_400_000;
const LAST_ENTRY_LOOK_BACK_MS = 183 * 86_400_000;

/** The form's bearing rows, in its order: the unit, its group, the field stem before `-d-side-c` / `-nd-side-c`. */
const UNITS: { unit: string; group: HsmGearBearing['group']; key: string }[] = [
  ...[1, 2, 3, 4].map((n) => ({ unit: `RM ${n}`, group: 'roughing' as const, key: `rm-stand-${n}` })),
  { unit: 'VE 1 · N-OS', group: 'roughing', key: 've-1-n-os' },
  { unit: 'VE 1 · OS', group: 'roughing', key: 've-1-os' },
  { unit: 'RM 5', group: 'roughing', key: 'rm-stand-5' },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ unit: `FM ${n}`, group: 'finishing' as const, key: `fm-${n}` })),
];
/** The lubrication tanks and the stands each serves (the plant's sheet). */
export const TANKS: { tank: number; stands: string; group: HsmOilTank['group'] }[] = [
  { tank: 1, stands: 'R1 & R2', group: 'roughing' },
  { tank: 2, stands: 'R3, R4 & R5', group: 'roughing' },
  { tank: 3, stands: 'F1, F2 & F3', group: 'finishing' },
  { tank: 4, stands: 'F4, F5 & F6', group: 'finishing' },
];

export function toBearingEntry(r: InsightEntry): HsmBearingEntry | null {
  const res = r.result ?? {};
  if (/\btest\b/i.test(String(res['remarks'] ?? ''))) return null;
  const date = String(res['date'] ?? '').slice(0, 10);
  if (!date) return null;
  const section = String(res['section'] ?? '').trim();
  return {
    date, time: res['time'] ? String(res['time']) : null, shift: String(res['shift'] ?? ''), section: section || null,
    bearings: UNITS.map((u) => ({ unit: u.unit, group: u.group, dC: num(res[`${u.key}-d-side-c`]), ndC: num(res[`${u.key}-nd-side-c`]) })),
    tanks: TANKS.map((t) => ({ ...t, tempC: num(res[`lubrication-tank-${t.tank}-c`]) })),
  };
}

const later = (a: HsmBearingEntry, b: HsmBearingEntry) =>
  a.date !== b.date ? a.date > b.date : (a.time ?? '') > (b.time ?? '');
const hasReading = (e: HsmBearingEntry) => e.bearings.some((b) => b.dC !== null || b.ndC !== null) || e.tanks.some((t) => t.tempC !== null);

/** Each unit's and tank's latest reading among `entries` (oldest first), with when it was taken. */
export function latestOf(entries: HsmBearingEntry[]): { bearings: HsmLatestBearing[]; tanks: HsmLatestTank[] } {
  const bearings = new Map<string, HsmLatestBearing>();
  const tanks = new Map<number, HsmLatestTank>();
  for (const e of entries) {
    const when = { date: e.date, time: e.time, shift: e.shift, section: e.section };
    for (const b of e.bearings) if (b.dC !== null || b.ndC !== null) bearings.set(b.unit, { ...b, ...when });
    for (const t of e.tanks) if (t.tempC !== null) tanks.set(t.tank, { ...t, ...when });
  }
  const order = (u: string) => UNITS.findIndex((x) => x.unit === u);
  return {
    bearings: [...bearings.values()].sort((a, b) => order(a.unit) - order(b.unit)),
    tanks: [...tanks.values()].sort((a, b) => a.tank - b.tank),
  };
}

const lastReadingDate = (entries: HsmBearingEntry[], to: string) =>
  entries.filter((e) => e.date <= to && hasReading(e)).reduce<string | null>((a, e) => (a === null || e.date > a ? e.date : a), null);

export async function hsmBearingTemp(env: Env, from: string, to: string): Promise<HsmBearingReport> {
  const startMs = Date.parse(`${from}T00:00:00+05:30`);
  const parse = (rows: InsightEntry[]) => rows.map(toBearingEntry).filter((e): e is HsmBearingEntry => e !== null);
  const read = await fetchFormEntries(BEARING_FORM, startMs - LOOK_BACK_MS, env);
  const all = read.ok ? parse(read.rows) : [];
  const entries = all
    .filter((e) => e.date >= from && e.date <= to)
    .sort((a, b) => (later(a, b) ? 1 : later(b, a) ? -1 : 0));
  let lastDate = lastReadingDate(all, to);
  if (lastDate === null && read.ok) {
    const older = await fetchFormEntries(BEARING_FORM, startMs - LAST_ENTRY_LOOK_BACK_MS, env).catch(() => null);
    if (older?.ok) lastDate = lastReadingDate(parse(older.rows), to);
  }
  const latest = latestOf(entries);
  return {
    from, to, form: BEARING_FORM,
    logbook: { connection: read.ok ? 'up' : 'down', message: read.ok ? MSG.LOGBOOK_UP : read.message },
    latestBearings: latest.bearings,
    latestTanks: latest.tanks,
    entries,
    lastDate,
  };
}
