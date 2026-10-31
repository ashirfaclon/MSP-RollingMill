/**
 * MID condition monitoring per mill, from the MID logbook forms (the user, 29 Oct 2026):
 * VIBRATION READING (one entry per point, with MID's status and remarks) and TEMPERATURE READING
 * (one entry per thermography reading).
 *
 * The logbook is the only source (the user, 31 Oct 2026): MID's four Excel vibration reports (HSM
 * 21 Apr, RMD 23 Jan, LSM 13 Apr, RMS 10 Jan 2026) were written into the Vibration Reading form
 * and are no longer read. A machine's status is the worst of its points', its diagnosis their remarks.
 * Its section is the one the plant gave it in MID Master, else worked out from its name (sections.ts).
 */
import type { Env } from '../../config/env';
import type { MidMachine, MidPoint, MidReport, MidSection, MidStatus, MidTemperature, MidVisit } from '../../contracts';
import { fetchFormEntries, num, type InsightEntry } from '../../integrations/logbook/client';
import { isDate } from '../hsm/production.service';
import { MID_MASTER_FORM, MID_TEMPERATURE_FORM, MID_VIBRATION_FORM, tagOf } from '../forms-db/forms';
import { machineKey, masterSection, sectionOf } from './sections';

interface ReadingRow extends MidPoint { date: string; mill: string; machine: string }
interface ConditionRow { date: string; mill: string; machine: string; status: string; diagnosis: string | null }
interface TemperatureRow extends MidTemperature { date: string; mill: string }


const highest = (points: MidPoint[]) => {
  const v = points.flatMap((p) => [p.horizontal, p.vertical, p.axial]).filter((x): x is number => x !== null);
  return v.length ? Math.max(...v) : null;
};

const STATUSES: MidStatus[] = ['Good', 'Acceptable', 'Un-acceptable'];
const statusOf = (v: unknown) => (STATUSES.includes(v as MidStatus) ? (v as MidStatus) : null);
const text = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
/** Visits are filed after the day: read two years of submissions. */
const LOOK_BACK_MS = 730 * 86_400_000;

/** The logbook's entries of one form for a mill, oldest submission first (a re-filed entry wins). */
async function entries(env: Env, form: string, mill: string): Promise<{ date: string; v: Record<string, unknown> }[]> {
  const read = await fetchFormEntries(tagOf(form), Date.now() - LOOK_BACK_MS, env);
  if (!read.ok) return [];
  const at = (r: InsightEntry) => String(r.createdAt ?? r.invocationTime ?? '');
  return [...read.rows].sort((a, b) => at(a).localeCompare(at(b)))
    .map((r) => ({ v: r.result ?? {}, date: String(r.result?.date ?? '').slice(0, 10) }))
    // The mill is the form's Unit (renamed from Mill, with Division before it — the user, 31 Oct 2026):
    // Division RM, Unit HSM / RMD / LSM / RMS. Entries filed before the rename keep Mill and no Division.
    .filter((e) => isDate(e.date)
      && String(e.v.unit ?? e.v.mill ?? '').trim().toLowerCase() === mill
      && (e.v.division == null || String(e.v.division).trim().toUpperCase() === 'RM'));
}

/** MID Master: each of the mill's machines with a Section → that section; the latest entry with one wins. */
async function masterSections(env: Env, mill: string): Promise<Map<string, MidSection>> {
  const read = await fetchFormEntries(tagOf(MID_MASTER_FORM), Date.now() - 10 * 365 * 86_400_000, env);
  const out = new Map<string, MidSection>();
  if (!read.ok) return out;
  const at = (r: InsightEntry) => String(r.createdAt ?? r.invocationTime ?? '');
  for (const r of [...read.rows].sort((a, b) => at(a).localeCompare(at(b)))) {
    const v = r.result ?? {};
    const s = masterSection(v.section);
    const machine = text(v.machine);
    if (s && machine && String(v.unit ?? '').trim().toLowerCase() === mill && String(v.division ?? '').trim().toUpperCase() === 'RM') {
      out.set(machineKey(machine), s);
    }
  }
  return out;
}

/** The report with the MID logbook forms' entries laid over the Excel reports. Logbook down: the reports alone. */
export async function midReportLive(env: Env, mill: string, to: string): Promise<MidReport> {
  const [vib, temp, sections] = await Promise.all([
    entries(env, MID_VIBRATION_FORM, mill).catch(() => []),
    entries(env, MID_TEMPERATURE_FORM, mill).catch(() => []),
    masterSections(env, mill).catch(() => new Map<string, MidSection>()),
  ]);
  // One reading per date, machine, component and point: the latest filed.
  const points = new Map<string, ReadingRow & { status: MidStatus | null; remarks: string | null }>();
  for (const { date, v } of vib) {
    const machine = text(v.machine); const component = text(v.component); const point = text(v.point);
    if (!machine || !component || !point) continue;
    points.set([date, machine, component, point].join('|'), {
      date, mill, machine, part: null, component, point,
      horizontal: num(v['horizontal-mm-s-rms']), vertical: num(v['vertical-mm-s-rms']), axial: num(v['axial-mm-s-rms']),
      status: statusOf(v.status), remarks: text(v.remarks),
    });
  }
  const logged = [...points.values()];
  const key = (r: { date: string; machine: string }) => `${r.date}|${r.machine}`;
  const conditions = new Map<string, ConditionRow>();
  for (const r of logged) {
    const c = conditions.get(key(r));
    const worse = !c || (r.status !== null && STATUSES.indexOf(r.status) > STATUSES.indexOf(c.status as MidStatus));
    const notes = [...new Set([...(c?.diagnosis ? c.diagnosis.split(' · ') : []), ...(r.remarks ? [r.remarks] : [])])];
    conditions.set(key(r), {
      date: r.date, mill, machine: r.machine,
      status: (worse ? r.status : c!.status) ?? '', diagnosis: notes.length ? notes.join(' · ') : null,
    });
  }
  // One reading per date, equipment and phase: the latest filed.
  const thermo = new Map<string, TemperatureRow>();
  for (const { date, v } of temp) {
    const equipment = text(v.equipment);
    if (!equipment) continue;
    thermo.set([date, equipment, text(v.phase)].join('|'), {
      date, mill, equipment, phase: text(v.phase), loadMw: num(v['load-during-monitoring-mw']),
      designC: num(v['design-temperature-c']), maxC: num(v['max-temperature-recorded-c']), status: statusOf(v.status), remarks: text(v.remarks),
    });
  }
  const temperatures = [...thermo.values()];
  const report = midReport(
    mill, to,
    logged,
    [...conditions.values()],
    temperatures,
    sections,
  );
  const dates = (rows: { date: string }[]) => [...new Set(rows.map((r) => r.date).filter((d) => d <= to))].sort();
  report.sources.push(
    ...dates(logged).map((date) => ({ kind: 'logbook' as const, name: 'MID Logbook → Vibration Reading', date })),
    ...dates(temperatures).map((date) => ({ kind: 'logbook' as const, name: 'MID Logbook → Temperature Reading', date })),
  );
  return report;
}

export function midReport(
  mill: string, to: string, readings: ReadingRow[] = [], conditions: ConditionRow[] = [], temperatures: TemperatureRow[] = [],
  sections?: Map<string, MidSection>,
): MidReport {
  const rows = readings.filter((r) => r.mill === mill && r.date <= to);
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const visits: MidVisit[] = dates.map((date) => {
    const mine = rows.filter((r) => r.date === date);
    const names = [...new Set(mine.map((r) => r.machine))];
    return {
      date,
      machines: names.map((machine): MidMachine => {
        const points = mine.filter((r) => r.machine === machine)
          .map(({ part, component, point, horizontal, vertical, axial }) => ({ part, component, point, horizontal, vertical, axial }));
        const c = conditions.find((x) => x.mill === mill && x.date === date && x.machine === machine);
        return {
          machine, section: sectionOf(mill, machine, sections),
          status: statusOf(c?.status),
          diagnosis: c?.diagnosis ?? null,
          maxMmS: highest(points),
          points,
        };
      }),
    };
  });
  const thermo = temperatures.filter((t) => t.mill === mill && t.date <= to);
  const thermoDate = thermo.map((t) => t.date).sort().at(-1) ?? null;
  return {
    mill, to,
    sources: [],
    visits,
    latest: visits.at(-1) ?? null,
    temperature: thermoDate === null ? null : {
      date: thermoDate,
      readings: thermo.filter((t) => t.date === thermoDate).map(({ date: _d, mill: _m, ...t }) => t),
    },
    skipped: [],
  };
}
