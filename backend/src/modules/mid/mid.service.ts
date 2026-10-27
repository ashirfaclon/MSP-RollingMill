/**
 * MID vibration monitoring per mill, in the shapes of the MID logbook forms (MID Logbook Form Spec):
 * Form 1 VIBRATION READING (one row per point) and Form 2 MACHINE CONDITION (one row per machine).
 *
 * Until the forms go live, the rows are MID's Excel reports, converted once by
 * scripts/import-mid-reports.py into data/mid-reports.json (the user, 27 Oct 2026). When the forms
 * are made, their entries join here as a second source, a logbook entry replacing a report row of
 * the same date, mill, machine and point; the screens read the same report either way.
 */
import type { MidMachine, MidPoint, MidReport, MidStatus, MidVisit } from '../../contracts';
import { sectionOf } from './sections';
import reports from './data/mid-reports.json';

interface ReadingRow extends MidPoint { date: string; mill: string; machine: string }
interface ConditionRow { date: string; mill: string; machine: string; status: string; diagnosis: string | null }

const READINGS = reports.readings as ReadingRow[];
const CONDITIONS = reports.conditions as ConditionRow[];

const highest = (points: MidPoint[]) => {
  const v = points.flatMap((p) => [p.horizontal, p.vertical, p.axial]).filter((x): x is number => x !== null);
  return v.length ? Math.max(...v) : null;
};

export function midReport(mill: string, to: string, readings = READINGS, conditions = CONDITIONS): MidReport {
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
          machine, section: sectionOf(mill, machine),
          status: (c?.status as MidStatus | undefined) ?? null,
          diagnosis: c?.diagnosis ?? null,
          maxMmS: highest(points),
          points,
        };
      }),
    };
  });
  return {
    mill, to,
    sources: reports.source.filter((s) => s.mill === mill && s.date <= to).map((s) => ({ kind: 'report' as const, name: s.file, date: s.date })),
    visits,
    latest: visits.at(-1) ?? null,
    skipped: reports.skipped.filter((s) => s.mill === mill && s.date <= to).map(({ date, machine, point, field, raw }) => ({ date, machine, point, field, raw })),
  };
}
