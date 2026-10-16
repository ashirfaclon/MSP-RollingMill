/**
 * RMD asset-health readings from the IOsense logbook, "Rolling Mill Division (TMT) → Mechanical"
 * (RMD FACLON persona - 3, confirmed by the user 15 Oct 2026):
 *   Mill Bearing Temperature  tmt-mechanical/20-inch-r-stand, 16-inch-r-stand, intermill,
 *                             old-continuous-stand (OC 1–6), new-continuous-stand (NC 1–8), °C;
 *                             filled twice a day;
 *   Oil Tank                  tmt-mechanical/oil-tank-level (inches, every 15 days) and
 *                             oil-tank-temperature (°C, twice a day), one value per tank.
 * Groups (the user): roughing = 20" and 16" R stands; route / diverter = intermill, NC stands
 * (line 1) and OC stands (line 2). An entry remarked "test" is left out.
 * Each form has two dates (the user, 16 Oct 2026): "Date" is the day the readings are for — it
 * places the entry; "Time" is when the form was filled — it only orders two entries of one day.
 *
 * Limits (the plant, 16 Oct 2026): bearings 45–65 °C, flywheel 45–80 °C, oil tank temperature
 * 45–65 °C. A reading outside them is "low" or "high". Oil tank level has no limits yet.
 *
 * Each request reads the forms fresh from the logbook (one call per form, shared for 30 s), so
 * an entry deleted or corrected there is gone or changed on the next refresh. Entries are typed
 * late, so the read takes everything submitted from a month before the period.
 */
import type { Env } from '../../config/env';
import type { RmdAssetForms, RmdBearingGroup, RmdOilGroup, RmdReading } from '../../contracts';
import { fetchFormsEntries, num, type InsightEntry } from '../../integrations/logbook/client';
import { MSG } from '../../shared/messages';

export type AssetGroup = 'roughing' | 'route';
const DAY_MS = 86_400_000;
const LOOK_BACK_MS = 31 * DAY_MS;
const PREFIX = 'tmt-mechanical/';

/** Bearing forms → equipment, group and how each field reads as "equipment · point". */
const BEARING_FORMS: Record<string, { group: AssetGroup; equipment: string }> = {
  '20-inch-r-stand': { group: 'roughing', equipment: '20" R stand' },
  '16-inch-r-stand': { group: 'roughing', equipment: '16" R stand' },
  intermill: { group: 'route', equipment: 'Intermill' },
  'old-continuous-stand': { group: 'route', equipment: 'OC stand' },
  'new-continuous-stand': { group: 'route', equipment: 'NC stand' },
};
const POINT: Record<string, string> = {
  'flywheel-d-side': 'Flywheel D side', 'flywheel-nd-side': 'Flywheel ND side',
  'reduction-gear-d-side': 'Reduction gear D side', 'reduction-gear-nd-side': 'Reduction gear ND side',
  'pinion-gear-d-side': 'Pinion gear D side', 'pinion-gear-nd-side': 'Pinion gear ND side',
};

/** One bearing field → { equipment, point }: "old-c-stand-3-pinion-gear-d-side-c" → OC stand 3 · Pinion gear D side. */
export function bearingOf(form: string, field: string): { equipment: string; point: string } | null {
  const def = BEARING_FORMS[form];
  if (!def || !field.endsWith('-c')) return null;
  const m = /^(?:(?:old|new)-c-stand-(\d+)-)?(.+)-c$/.exec(field);
  if (!m || !POINT[m[2]]) return null;
  return { equipment: m[1] ? `${def.equipment} ${m[1]}` : def.equipment, point: POINT[m[2]] };
}

/** Oil tanks → group and label, by the field stem (level: "20-r-stand", temperature: "20-r-stand-c"). */
const TANKS: [string, AssetGroup, string][] = [
  ['20-r-stand', 'roughing', '20" R stand'], ['16-r-stand', 'roughing', '16" R stand'], ['intermill', 'route', 'Intermill'],
  ['old-continuous-stand-1-2', 'route', 'OC stand 1–2'], ['old-continuous-stand-3-4', 'route', 'OC stand 3–4'], ['old-continuous-stand-5-6', 'route', 'OC stand 5–6'],
  ['new-continuous-stand-1-2', 'route', 'NC stand 1–2'], ['new-continuous-stand-3-4', 'route', 'NC stand 3–4'],
  ['new-continuous-stand-5-6', 'route', 'NC stand 5–6'], ['new-continuous-stand-7-8', 'route', 'NC stand 7–8'],
];

/** The plant's limits, °C. */
export const LIMITS = { bearing: [45, 65], flywheel: [45, 80], oilTemp: [45, 65] } as const;

/** A reading with its limits and where it falls. */
export function withLimits(r: Omit<RmdReading, 'min' | 'max' | 'status'>, limits: readonly [number, number] | null): RmdReading {
  if (!limits) return { ...r, min: null, max: null, status: null };
  const [min, max] = limits;
  return { ...r, min, max, status: r.value < min ? 'low' : r.value > max ? 'high' : 'ok' };
}
const bearingLimits = (point: string) => (point.startsWith('Flywheel') ? LIMITS.flywheel : LIMITS.bearing);

interface Entry { form: string; date: string; time: string | null; createdMs: number; res: Record<string, unknown> }

/** Every mechanical form this screen reads, by its logbook tag. */
const TAGS = [...Object.keys(BEARING_FORMS), 'oil-tank-level', 'oil-tank-temperature'].map((f) => PREFIX + f);

function toEntry(r: InsightEntry): Entry | null {
  const tag = String((r.tags ?? [])[0] ?? r.resultName ?? '');
  if (!tag.startsWith(PREFIX)) return null;
  const res = r.result ?? {};
  if (/\btest\b/i.test(String(res['remarks'] ?? ''))) return null;   // a test entry is not a reading
  const createdMs = Date.parse(r.createdAt ?? r.invocationTime ?? '');
  return {
    form: tag.slice(PREFIX.length), date: String(res['date'] ?? '').slice(0, 10),
    time: res['time'] ? String(res['time']) : null, createdMs: Number.isFinite(createdMs) ? createdMs : 0, res,
  };
}

/** Later entry first by its Date (the day the readings are for), then by when it was filled. */
const later = (a: Entry, b: Entry) =>
  a.date !== b.date ? a.date > b.date : (a.time ?? '') !== (b.time ?? '') ? (a.time ?? '') > (b.time ?? '') : a.createdMs > b.createdMs;
const order = (a: Entry, b: Entry) => (later(a, b) ? 1 : later(b, a) ? -1 : 0);

export function bearingGroup(entries: Entry[], group: AssetGroup): RmdBearingGroup {
  const mine = entries.filter((e) => BEARING_FORMS[e.form]?.group === group);
  // Per form, the latest entry; the group's latest reading is all of those together.
  const latestByForm = new Map<string, Entry>();
  for (const e of mine) {
    const cur = latestByForm.get(e.form);
    if (!cur || later(e, cur)) latestByForm.set(e.form, e);
  }
  const readingsOf = (e: Entry): RmdReading[] => Object.entries(e.res).flatMap(([field, v]) => {
    const b = bearingOf(e.form, field);
    const c = num(v);
    return b && c !== null ? [withLimits({ ...b, value: c, at: e.date }, bearingLimits(b.point))] : [];
  });
  const latest = [...latestByForm.values()].flatMap(readingsOf)
    .sort((a, b) => a.equipment.localeCompare(b.equipment, undefined, { numeric: true }) || a.point.localeCompare(b.point));
  const max = latest.reduce<RmdReading | null>((m, r) => (m === null || r.value > m.value ? r : m), null);
  // Trend: the hottest bearing of each entry, oldest first.
  const trend = [...mine].sort(order).map((e) => {
    const rs = readingsOf(e);
    return rs.length ? { at: e.date, equipment: BEARING_FORMS[e.form].equipment, maxC: Math.max(...rs.map((r) => r.value)) } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);
  return { latest, max, trend, entries: mine.length };
}

export function oilGroup(entries: Entry[], group: AssetGroup): RmdOilGroup {
  const tanks = TANKS.filter(([, g]) => g === group);
  const latest = (form: string) => entries.filter((e) => e.form === form)
    .reduce<Entry | null>((m, e) => (m === null || later(e, m) ? e : m), null);
  const lv = latest('oil-tank-level');
  const tp = latest('oil-tank-temperature');
  const level = lv ? tanks.flatMap(([stem, , label]) => {
    const v = num(lv.res[stem]);
    return v === null ? [] : [withLimits({ equipment: label, point: 'Level', value: v, at: lv.date }, null)];
  }) : [];
  const temperature = tp ? tanks.flatMap(([stem, , label]) => {
    const v = num(tp.res[`${stem}-c`]);
    return v === null ? [] : [withLimits({ equipment: label, point: 'Temperature', value: v, at: tp.date }, LIMITS.oilTemp)];
  }) : [];
  const min = level.reduce<RmdReading | null>((m, r) => (m === null || r.value < m.value ? r : m), null);
  return { level, temperature, minLevel: min };
}

export async function rmdAssetForms(env: Env, from: string, to: string): Promise<RmdAssetForms> {
  const read = await fetchFormsEntries(TAGS, Date.parse(`${from}T00:00:00+05:30`) - LOOK_BACK_MS, env);
  const rows = read.ok ? read.rows.map(toEntry).filter((e): e is Entry => e !== null) : [];
  const inPeriod = rows.filter((e) => e.date >= from && e.date <= to);
  return {
    from, to,
    logbook: { connection: read.ok ? 'up' : 'down', message: read.ok ? MSG.LOGBOOK_UP : read.message },
    bearing: { roughing: bearingGroup(inPeriod, 'roughing'), route: bearingGroup(inPeriod, 'route') },
    oil: { roughing: oilGroup(inPeriod, 'roughing'), route: oilGroup(inPeriod, 'route') },
  };
}

export type { Entry as RmdFormEntry };
