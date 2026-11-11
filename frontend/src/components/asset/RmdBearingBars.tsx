'use client';

/**
 * RMD · Condition trends · bearing temperature, all stands in one chart (the user, 11 Nov 2026, from
 * the plant's reference graph): each stand's latest reading, a bar per bearing (flywheel, reduction
 * gear, pinion gear; DE solid, NDE hatched) with its value, the alert limits as dashed lines with
 * the outside shaded, and a line saying whether any bearing is outside its limits. No stand buttons:
 * a dropdown picks All (default), Roughing or Route. The trend over time is in the drill-down.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { dm } from '@/lib/plantDay';
import { fixed } from '@/lib/num';
import type { RmdReading } from '@/services/hsmApi';

export type BearingSet = 'all' | 'roughing' | 'route';
/** A latest reading, with its stand's group and the time of its entry ("HH:MM", when filled in). */
export interface StandReading extends RmdReading { group: 'roughing' | 'route'; time: string | null }

const SETS: { id: BearingSet; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'roughing', label: 'Roughing' }, { id: 'route', label: 'Route' }];
/** Each position keeps the colour it has in the bearing trend (BearingTrendAll's order). */
const POSITIONS = [
  { name: 'Flywheel', color: 'var(--cat-2)' },
  { name: 'Reduction gear', color: 'var(--cat-3)' },
  { name: 'Pinion gear', color: 'var(--cat-4)' },
];
const STAND_ORDER = ['20" R stand', '16" R stand', 'Intermill', 'NC stand', 'OC stand'];

/** "NC stand 3" → [3, 3]: the stands in mill order, numbers in order. */
const standKey = (s: string): [number, number] => {
  const m = /^(.*?)(?:\s+(\d+))?$/.exec(s)!;
  const i = STAND_ORDER.indexOf(m[1]);
  return [i < 0 ? STAND_ORDER.length : i, Number(m[2] ?? 0)];
};
/** "Reduction gear ND side" → position "Reduction gear", side NDE. */
const split = (point: string) => {
  const m = /^(.*?)\s+(ND|D) side$/i.exec(point);
  return { position: m ? m[1] : point, nde: !!m && m[2].toUpperCase() === 'ND' };
};

// Geometry (px). Bars widen (to BAR_MAX) when a few stands leave the panel room; LABELS = the limit labels' room on the right.
const BAR = 22, BAR_MAX = 64, GAP = 2, PAD = 16, TOP = 26, PLOT = 300, BOTTOM = 40, AXIS = 40, LABELS = 150;

/** The entry's time as HH:MM — the form holds a time or a full date-time. */
const hhmm = (t: string | null) => (t ? /(\d{1,2}:\d{2})/.exec(t)?.[1] ?? null : null);

export default function RmdBearingBars({ readings, empty }: { readings: StandReading[]; empty: string }) {
  const [set, setSet] = useState<BearingSet>('all');
  // The panel's width, to stretch the bars when there is room.
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRoom(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [readings.length]);
  const view = useMemo(() => {
    const rows = readings.filter((r) => set === 'all' || r.group === set).map((r) => {
      const { position, nde } = split(r.point);
      const p = POSITIONS.findIndex((x) => x.name === position);
      return { ...r, time: hhmm(r.time), position, nde, p: p < 0 ? POSITIONS.length : p };
    });
    const stands = [...new Set(rows.map((r) => r.equipment))].sort((a, b) => {
      const [ga, na] = standKey(a), [gb, nb] = standKey(b);
      return ga - gb || na - nb || a.localeCompare(b);
    }).map((name) => ({
      name,
      bars: rows.filter((r) => r.equipment === name).sort((a, b) => a.p - b.p || Number(a.nde) - Number(b.nde)),
    }));
    return { rows, stands };
  }, [readings, set]);

  const { rows, stands } = view;
  const stamp = (r: { at: string; time: string | null }) => `${r.at} ${r.time ?? ''}`.trim();
  const last = rows.reduce<StandReading | null>((m, r) => (m === null || stamp(r) > stamp(m) ? r : m), null);
  const outside = rows.filter((r) => r.status === 'high' || r.status === 'low');
  const hi = rows.reduce((m, r) => Math.max(m, r.value), -Infinity);
  const lo = rows.reduce((m, r) => Math.min(m, r.value), Infinity);

  // The limits drawn: the bearings', and the flywheel's where it differs and a flywheel is shown.
  const limitOf = (fly: boolean) => rows.find((r) => (r.position === 'Flywheel') === fly && r.min !== null && r.max !== null) ?? null;
  const bl = limitOf(false), fl = limitOf(true);
  const main = bl ?? fl;
  const lines: { y: number; text: string; dash: string }[] = [];
  if (main) {
    const who = bl && fl && (fl.max !== bl.max || fl.min !== bl.min) ? 'Bearings' : 'Alert';
    lines.push({ y: main.max!, text: `${who}: above ${main.max} °C`, dash: '8 5' }, { y: main.min!, text: `${who}: below ${main.min} °C`, dash: '8 5' });
    if (bl && fl) {
      if (fl.max !== bl.max) lines.push({ y: fl.max!, text: `Flywheel: above ${fl.max} °C`, dash: '3 4' });
      if (fl.min !== bl.min) lines.push({ y: fl.min!, text: `Flywheel: below ${fl.min} °C`, dash: '3 4' });
    }
  }
  const top = Math.max(80, ...lines.map((l) => l.y + 10), Number.isFinite(hi) ? Math.ceil((hi + 8) / 10) * 10 : 0);
  const y = (v: number) => TOP + PLOT - (Math.max(0, v) / top) * PLOT;
  const ticks = Array.from({ length: Math.floor(top / 10) + 1 }, (_, i) => i * 10);

  const nBars = stands.reduce((n, s) => n + s.bars.length, 0);
  const fixedW = stands.reduce((w, s) => w + PAD * 2 + (s.bars.length - 1) * GAP, 0) + LABELS;
  const bar = nBars ? Math.min(BAR_MAX, Math.max(BAR, Math.floor((room - fixedW) / nBars))) : BAR;
  const groupW = (n: number) => PAD * 2 + n * bar + (n - 1) * GAP;
  const xs = stands.reduce<number[]>((a, s, i) => [...a, i === 0 ? 0 : a[i - 1] + groupW(stands[i - 1].bars.length)], []);
  const plotW = stands.reduce((w, s) => w + groupW(s.bars.length), 0);
  const width = plotW + LABELS;
  const height = TOP + PLOT + BOTTOM;
  const positionsShown = POSITIONS.filter((p) => rows.some((r) => r.position === p.name));

  return (
    <div className="ah-trend">
      <div className="ah-trend-head">
        <span className="rm-k">Bearing temp · °C{last && <span className="rm-card-last ah-trend-last"> · Last entry · {dm(last.at)}{last.time ? ` ${last.time}` : ''}</span>}</span>
        <label className="brb-set">
          <span>Stands</span>
          <select value={set} onChange={(e) => setSet(e.target.value as BearingSet)} aria-label="Stands shown">
            {SETS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {!rows.length ? <p className="ah-trend-empty">{empty}</p> : (
        <>
          <div className="brb-top">
            {outside.length
              ? <span className="chip chip--risk" role="status">⚠ {outside.length} bearing{outside.length === 1 ? ' is' : 's are'} outside the alert limits: {outside.slice(0, 3).map((r) => `${r.equipment} ${r.position} ${r.nde ? 'NDE' : 'DE'} ${fixed(r.value, 0)} °C`).join(', ')}{outside.length > 3 ? ' …' : ''}</span>
              : <span className="chip chip--ok" role="status">✓ No bearing is outside the alert limits (highest {fixed(hi, 0)} °C, lowest {fixed(lo, 0)} °C)</span>}
            <span className="brb-legend" aria-label="Legend">
              {positionsShown.map((p) => <span key={p.name}><i style={{ background: p.color }} />{p.name}</span>)}
              <span><i className="brb-solid" />DE</span><span><i className="brb-hatch" />NDE</span>
            </span>
          </div>

          <div className="brb-chart">
            {/* The axis stays put while the stands scroll. */}
            <svg className="brb-axis" width={AXIS} height={height} aria-hidden>
              {ticks.map((t) => <text key={t} x={AXIS - 6} y={y(t) + 3.5} textAnchor="end">{t}</text>)}
            </svg>
            <div className="brb-scroll" ref={box}>
              <svg width={Math.max(width, 1)} height={height} role="img" aria-label={`Bearing temperature by stand, ${stands.length} stands`}>
                <defs>
                  {POSITIONS.map((p, i) => (
                    <pattern key={p.name} id={`brb-h${i}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <rect width="7" height="7" fill={p.color} />
                      <line x1="0" y1="0" x2="0" y2="7" className="brb-hatch-line" strokeWidth="2.2" />
                    </pattern>
                  ))}
                </defs>
                {/* Outside the limits, shaded. */}
                {main && <rect x={0} y={TOP} width={width} height={y(main.max!) - TOP} className="brb-band" />}
                {main && <rect x={0} y={y(main.min!)} width={width} height={TOP + PLOT - y(main.min!)} className="brb-band" />}
                {ticks.map((t) => <line key={t} x1={0} x2={width} y1={y(t)} y2={y(t)} className="brb-grid" />)}

                {stands.map((s, si) => (
                  <g key={s.name} transform={`translate(${xs[si]},0)`}>
                    {si > 0 && <line x1={0} x2={0} y1={TOP} y2={TOP + PLOT} className="brb-sep" />}
                    {s.bars.map((b, bi) => {
                      const x = PAD + bi * (bar + GAP);
                      const by = y(b.value);
                      const h = TOP + PLOT - by;
                      const out = b.status === 'high' || b.status === 'low';
                      const name = `${b.position} ${b.nde ? 'NDE' : 'DE'}`;
                      const color = POSITIONS[b.p]?.color ?? 'var(--cat-6)';
                      return (
                        <g key={b.point}>
                          <title>{`${s.name} · ${name}: ${fixed(b.value, 0)} °C${b.min !== null ? ` (limits ${b.min}–${b.max} °C)` : ''} · ${dm(b.at)}${b.time ? ` ${b.time}` : ''}`}</title>
                          <path d={`M${x},${TOP + PLOT} V${by + 4} q0,-4 4,-4 h${bar - 8} q4,0 4,4 V${TOP + PLOT} Z`}
                            fill={b.nde ? `url(#brb-h${b.p})` : color} className={out ? 'brb-bar brb-bar--out' : 'brb-bar'} />
                          <text x={x + bar / 2} y={by - 5} textAnchor="middle" className={out ? 'brb-val brb-val--out' : 'brb-val'}>{fixed(b.value, 0)}</text>
                          {h > name.length * 6 + 14 && (
                            <text transform={`translate(${x + bar / 2 + 3.5},${TOP + PLOT - 8}) rotate(-90)`} className="brb-in">{name}</text>
                          )}
                        </g>
                      );
                    })}
                    <text x={groupW(s.bars.length) / 2} y={TOP + PLOT + 17} textAnchor="middle" className="brb-stand">{s.name}</text>
                    {last && s.bars[0] && s.bars[0].at !== last.at && (
                      <text x={groupW(s.bars.length) / 2} y={TOP + PLOT + 31} textAnchor="middle" className="brb-date">{dm(s.bars[0].at)}</text>
                    )}
                  </g>
                ))}

                {lines.map((l) => <line key={l.text} x1={0} x2={width} y1={y(l.y)} y2={y(l.y)} className="brb-limit" strokeDasharray={l.dash} />)}
                <line x1={0} x2={width} y1={TOP + PLOT} y2={TOP + PLOT} className="brb-base" />
              </svg>
            </div>
            {/* The limit labels stay at the right edge while the stands scroll. */}
            {lines.map((l) => (
              <span key={l.text} className="brb-limit-text" style={{ top: y(l.y) + (l.text.includes('below') ? 4 : -20) }}>{l.text}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
