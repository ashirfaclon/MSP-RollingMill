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
 *
 * The logbook engine returns every form's entries newest first: the reader pages from the top
 * until a week before the period (entries are typed late) and keeps what it read a few minutes.
 */
import type { Env } from '../../config/env';
import type { RmdAssetForms, RmdBearingGroup, RmdOilGroup, RmdReading } from '../../contracts';
import { fetchInsightPage, num } from '../../integrations/logbook/client';
import { MSG } from '../../shared/messages';

export type AssetGroup = 'roughing' | 'route';
const DAY_MS = 86_400_000;
const ENTRY_LAG_MS = 7 * DAY_MS;
const FRESH_MS = 3 * 60_000;
const MAX_PAGES = 200;
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

interface Entry { form: string; date: string; time: string | null; createdMs: number; res: Record<string, unknown> }
const read: { rows: Entry[]; reachedMs: number; at: number; up: boolean; message: string } = {
  rows: [], reachedMs: Infinity, at: 0, up: false, message: MSG.LOGBOOK_NOT_MAPPED,
};

async function ensure(env: Env, sinceMs: number) {
  if (read.reachedMs <= sinceMs && Date.now() - read.at < FRESH_MS) return;
  const rows: Entry[] = [];
  let reached = Infinity;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const p = await fetchInsightPage(page, env);
    if (!p.ok) { read.up = false; read.message = p.message; return; }
    read.up = true; read.message = MSG.LOGBOOK_UP;
    for (const r of p.rows) {
      const tag = String((r.tags ?? [])[0] ?? r.resultName ?? '');
      const createdMs = Date.parse(r.createdAt ?? r.invocationTime ?? '');
      if (Number.isFinite(createdMs)) reached = Math.min(reached, createdMs);
      if (!tag.startsWith(PREFIX)) continue;
      const res = r.result ?? {};
      if (/\btest\b/i.test(String(res['remarks'] ?? ''))) continue;   // a test entry is not a reading
      rows.push({
        form: tag.slice(PREFIX.length), date: String(res['date'] ?? '').slice(0, 10),
        time: res['time'] ? String(res['time']) : null, createdMs: Number.isFinite(createdMs) ? createdMs : 0, res,
      });
    }
    if (p.rows.length === 0 || reached < sinceMs) break;
  }
  read.rows = rows;
  read.reachedMs = reached;
  read.at = Date.now();
}

/** When an entry was taken: its time, else its date. */
const whenOf = (e: Entry) => e.time ?? e.date;

export function bearingGroup(entries: Entry[], group: AssetGroup): RmdBearingGroup {
  const mine = entries.filter((e) => BEARING_FORMS[e.form]?.group === group);
  // Per form, the latest entry; the group's latest reading is all of those together.
  const latestByForm = new Map<string, Entry>();
  for (const e of mine) {
    const cur = latestByForm.get(e.form);
    if (!cur || whenOf(e) > whenOf(cur) || (whenOf(e) === whenOf(cur) && e.createdMs > cur.createdMs)) latestByForm.set(e.form, e);
  }
  const readingsOf = (e: Entry): RmdReading[] => Object.entries(e.res).flatMap(([field, v]) => {
    const b = bearingOf(e.form, field);
    const c = num(v);
    return b && c !== null ? [{ ...b, value: c, at: whenOf(e) }] : [];
  });
  const latest = [...latestByForm.values()].flatMap(readingsOf)
    .sort((a, b) => a.equipment.localeCompare(b.equipment, undefined, { numeric: true }) || a.point.localeCompare(b.point));
  const max = latest.reduce<RmdReading | null>((m, r) => (m === null || r.value > m.value ? r : m), null);
  // Trend: the hottest bearing of each entry, oldest first.
  const trend = mine.map((e) => {
    const rs = readingsOf(e);
    return rs.length ? { at: whenOf(e), equipment: BEARING_FORMS[e.form].equipment, maxC: Math.max(...rs.map((r) => r.value)) } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null).sort((a, b) => a.at.localeCompare(b.at));
  return { latest, max, trend, entries: mine.length };
}

export function oilGroup(entries: Entry[], group: AssetGroup): RmdOilGroup {
  const tanks = TANKS.filter(([, g]) => g === group);
  const latest = (form: string) => entries.filter((e) => e.form === form)
    .reduce<Entry | null>((m, e) => (m === null || whenOf(e) > whenOf(m) || (whenOf(e) === whenOf(m) && e.createdMs > m.createdMs) ? e : m), null);
  const lv = latest('oil-tank-level');
  const tp = latest('oil-tank-temperature');
  const level = lv ? tanks.flatMap(([stem, , label]) => {
    const v = num(lv.res[stem]);
    return v === null ? [] : [{ equipment: label, point: 'Level', value: v, at: whenOf(lv) }];
  }) : [];
  const temperature = tp ? tanks.flatMap(([stem, , label]) => {
    const v = num(tp.res[`${stem}-c`]);
    return v === null ? [] : [{ equipment: label, point: 'Temperature', value: v, at: whenOf(tp) }];
  }) : [];
  const min = level.reduce<RmdReading | null>((m, r) => (m === null || r.value < m.value ? r : m), null);
  return { level, temperature, minLevel: min };
}

export async function rmdAssetForms(env: Env, from: string, to: string): Promise<RmdAssetForms> {
  await ensure(env, Date.parse(`${from}T00:00:00+05:30`) - ENTRY_LAG_MS);
  const inPeriod = read.rows.filter((e) => e.date >= from && e.date <= to);
  return {
    from, to,
    logbook: { connection: read.up ? 'up' : 'down', message: read.message },
    bearing: { roughing: bearingGroup(inPeriod, 'roughing'), route: bearingGroup(inPeriod, 'route') },
    oil: { roughing: oilGroup(inPeriod, 'roughing'), route: oilGroup(inPeriod, 'route') },
  };
}

export type { Entry as RmdFormEntry };
