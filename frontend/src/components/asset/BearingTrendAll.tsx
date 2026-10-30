'use client';

/**
 * Condition trends · bearing temperature: every bearing at every reading, not only the hottest (the
 * user, 31 Oct 2026). One line per bearing; the drive-end side solid, the non-drive end dashed.
 *   One bearing pair per unit (HSM: each stand's DC motor DE / NDE): every unit in one chart, a colour
 *     per unit (at most six).
 *   Several bearings per unit (LSM drives, RMD stands: flywheel, reduction gear, pinion): a button per
 *     unit above the chart, and the chosen unit's bearings, a colour per position.
 * The legend under the chart shows or hides each line.
 */
import { useMemo, useState } from 'react';
import DrillChart, { type DrillSeries } from '@/components/drill/DrillChart';
import { dm } from '@/lib/plantDay';
import { fixed } from '@/lib/num';
import type { HsmMillLoadEntry, LsmDriveReading, RmsDriveReading } from '@/services/hsmApi';

export interface BearingPoint {
  /** Sorts the readings in time: "YYYY-MM-DD HH:MM" (or the date alone). */
  at: string;
  /** The unit the bearing is on: a stand or a drive. */
  unit: string;
  /** Where on it: "DC motor", "Flywheel", "Reduction gear", "Pinion gear", "Reduction gearbox 1" … */
  position: string;
  /** The point at that position: "DE" / "NDE", or RMS's "Input inside" … */
  side: string;
  /** Drawn dashed (line) or hatched (bar): the non-drive end, or RMS's outside point. */
  dashed: boolean;
  value: number;
}

const CAT = ['--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5', '--cat-6'];
/** Positions keep one colour each, in this order of the ones a mill has. */
const POSITION_ORDER = ['DC motor', 'Flywheel', 'Reduction gear', 'Pinion gear', 'Reduction gearbox 1', 'Reduction gearbox 2', 'Pinion'];
const posIndex = (p: string) => { const i = POSITION_ORDER.indexOf(p); return i < 0 ? POSITION_ORDER.length : i; };

/** "2026-10-28 09:30" → "28 Oct 09:30"; a date alone → "28 Oct". */
const label = (at: string) => `${dm(at.slice(0, 10))}${at.length > 10 ? ` ${at.slice(11, 16)}` : ''}`;

/**
 * `last`: the points are the last entry's, the period having none (the user, 30 Oct 2026) — its date is
 * shown. `empty`: why there is nothing to draw (no source, or nothing ever recorded).
 */
export default function BearingTrendAll({ points, last = null, empty = 'No bearing readings in this period' }: { points: BearingPoint[]; last?: string | null; empty?: string }) {
  const units = useMemo(() => [...new Set(points.map((p) => p.unit))], [points]);
  const positions = useMemo(() => new Set(points.map((p) => p.position)), [points]);
  // One position per unit (HSM): every unit together. Otherwise one unit at a time.
  const perUnit = positions.size > 1 || units.length > CAT.length;
  const [picked, setPicked] = useState<string | null>(null);
  const unit = perUnit ? (picked && units.includes(picked) ? picked : units[0] ?? null) : null;

  const { categories, series } = useMemo(() => {
    const shown = unit ? points.filter((p) => p.unit === unit) : points;
    const ats = [...new Set(shown.map((p) => p.at))].sort();
    const idx = new Map(ats.map((a, i) => [a, i]));
    // A line per bearing: unit × position × side.
    const lines = new Map<string, { unit: string; position: string; side: string; dashed: boolean; data: (number | null)[] }>();
    for (const p of shown) {
      const key = `${p.unit}|${p.position}|${p.side}`;
      let l = lines.get(key);
      if (!l) { l = { unit: p.unit, position: p.position, side: p.side, dashed: p.dashed, data: ats.map(() => null) }; lines.set(key, l); }
      l.data[idx.get(p.at)!] = p.value;
    }
    const sorted = [...lines.values()].sort((a, b) =>
      (unit ? posIndex(a.position) - posIndex(b.position) : units.indexOf(a.unit) - units.indexOf(b.unit)) || Number(a.dashed) - Number(b.dashed));
    // A colour per position the mill has (its own order), or per unit when every unit is shown together.
    const present = [...new Set(points.map((p) => p.position))].sort((a, b) => posIndex(a) - posIndex(b));
    const colourOf = (l: { unit: string; position: string }) =>
      CAT[Math.min(unit ? present.indexOf(l.position) : units.indexOf(l.unit), CAT.length - 1)];
    const s: DrillSeries[] = sorted.map((l) => ({
      id: `${l.unit}|${l.position}|${l.side}`,
      name: unit ? `${l.position} ${l.side}` : `${l.unit} ${l.side}`,
      token: colourOf(l), type: 'line', dashed: l.dashed, data: l.data, dp: 0,
    }));
    return { categories: ats.map(label), series: s };
  }, [points, unit, units]);
  const axes = useMemo(() => [{ title: '°C', unit: '°C' }], []);

  return (
    <div className="ah-trend">
      <div className="ah-trend-head">
        <span className="rm-k">Bearing temp · °C{last && <span className="rm-card-last ah-trend-last"> · Last entry · {dm(last)}</span>}</span>
        {perUnit && units.length > 0 && (
          <span className="ah-unit-chips" role="group" aria-label="Unit">
            {units.map((u) => (
              <button key={u} type="button" className={`ah-unit-chip${u === unit ? ' on' : ''}`} aria-pressed={u === unit} onClick={() => setPicked(u)}>{u}</button>
            ))}
          </span>
        )}
      </div>
      {series.length && categories.length === 1
        // One reading in view: a line has nothing to join, so each bearing is a bar, hottest first.
        ? <BearingRows series={series} at={categories[0]} />
        : series.length
        ? <DrillChart series={series} categories={categories} axes={axes}
            ariaLabel={`Bearing temperature, every bearing${unit ? ` of ${unit}` : ''}: ${series.map((s) => `${s.name} ${(s.data as (number | null)[]).filter((v) => v !== null).join(', ')} °C`).join('; ')}`} />
        : <p className="ah-trend-empty">{empty}</p>}
    </div>
  );
}

/** One reading: every bearing as a bar on one °C scale, hottest first; its line colour, NDE hatched. */
function BearingRows({ series, at }: { series: DrillSeries[]; at: string }) {
  const rows = series
    .map((s) => ({ id: s.id, name: s.name, token: s.token, dashed: !!s.dashed, value: (s.data as (number | null)[])[0] }))
    .filter((r): r is typeof r & { value: number } => r.value !== null)
    .sort((x, y) => y.value - x.value);
  const scale = Math.max(80, Math.ceil(((rows[0]?.value ?? 0) * 1.1) / 10) * 10);
  const ticks = Array.from({ length: scale / 20 + 1 }, (_, i) => i * 20);
  const pct = (v: number) => `${(Math.min(v, scale) / scale) * 100}%`;
  return (
    <>
      <div className="vib-axis brg-axis" aria-hidden>
        <span className="ah-trend-date">{at}</span>
        <span className="vib-axis-track">{ticks.map((t) => <b key={t} style={{ left: pct(t) }}>{t}</b>)}</span>
        <span />
      </div>
      <ul className="vib-rows" aria-label={`Bearing temperature at ${at}, hottest first`}>
        {rows.map((r) => (
          <li key={r.id} className="vib-row brg-row" aria-label={`${r.name}: ${fixed(r.value, 0)} °C`}>
            <span className="vib-name" title={r.name}>{r.name}</span>
            <span className="vib-track">
              {ticks.slice(1, -1).map((t) => <i key={t} className="vib-guide" style={{ left: pct(t) }} aria-hidden />)}
              <span className={`vib-bar brg-bar${r.dashed ? ' brg-bar--nde' : ''}`} style={{ width: pct(r.value), ['--series' as string]: `var(${r.token})` }} />
            </span>
            <span className="vib-val num">{fixed(r.value, 0)} °C</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ---- Each mill's readings as bearing points ---- */

/** "HH:MM" from a form time: an ISO date-time or "HH:MM[:SS]". */
const hhmm = (t: string | null | undefined) => (!t ? '' : t.includes('T') ? t.slice(11, 16) : t.slice(0, 5));
const atOf = (date: string, time: string | null | undefined) => (hhmm(time) ? `${date} ${hhmm(time)}` : date);

/** HSM Mill Load Log Sheet: each stand's DC motor, DE and NDE. */
export function hsmBearingPoints(entries: HsmMillLoadEntry[]): BearingPoint[] {
  return entries.flatMap((e) => ([['DE', e.deTempC], ['NDE', e.ndeTempC]] as const)
    .filter(([, v]) => v !== null)
    .map(([side, v]) => ({ at: atOf(e.date, e.time), unit: e.stand, position: 'DC motor', side, dashed: side === 'NDE', value: v! })));
}

/** LSM drive temperature form: each drive's flywheel, reduction gear and pinion, DE and NDE. */
export function lsmBearingPoints(entries: LsmDriveReading[]): BearingPoint[] {
  const unit = (d: string) => d.replace(/^DRIVE\s*0*(\d+)$/i, 'Drive $1');
  return entries.flatMap((e) => ([
    ['Flywheel', 'DE', e.flywheelDeC], ['Flywheel', 'NDE', e.flywheelNdeC],
    ['Reduction gear', 'DE', e.reductionDeC], ['Reduction gear', 'NDE', e.reductionNdeC],
    ['Pinion gear', 'DE', e.pinionDeC], ['Pinion gear', 'NDE', e.pinionNdeC],
  ] as const).filter(([, , v]) => v !== null)
    .map(([position, side, v]) => ({ at: atOf(e.date, e.at), unit: unit(e.drive), position, side, dashed: side === 'NDE', value: v! })));
}

/** RMD Mill Bearing Temperature forms: "Pinion gear D side" → Pinion gear, DE; "… ND side" → NDE. */
export function rmdBearingPoints(history: { at: string; time: string | null; equipment: string; point: string; value: number }[]): BearingPoint[] {
  return history.map((h) => {
    const m = /^(.*?)\s+(ND|D) side$/i.exec(h.point);
    const nde = !!m && m[2].toUpperCase() === 'ND';
    return { at: atOf(h.at, h.time), unit: h.equipment, position: m ? m[1] : h.point, side: nde ? 'NDE' : 'DE', dashed: nde, value: h.value };
  });
}

/** RMS Drive Temp form: each drive's reduction gearboxes, pinion and flywheel; the outside points dashed. */
export function rmsBearingPoints(entries: RmsDriveReading[]): BearingPoint[] {
  const unit = (d: string) => d.replace(/^DRIVE\s*0*(\d+)$/i, 'Drive $1');
  return entries.flatMap((e) => e.bearings.map((b) => ({
    at: atOf(e.date, e.at), unit: unit(e.drive), position: b.component, side: b.point, dashed: /outside/i.test(b.point), value: b.valueC,
  })));
}
