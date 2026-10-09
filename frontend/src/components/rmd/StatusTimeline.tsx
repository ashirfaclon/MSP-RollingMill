'use client';

/**
 * On / off status of many points over time, as one row per point: time runs left to right,
 * each interval filled by how much of it the point was running (0–100 %), blank where there
 * was no reading. Fourteen 0/1 lines on one chart are unreadable; rows are not.
 */
import { useMemo } from 'react';

export interface TimelineRow { id: string; label: string; points: [number, number | null][] }

const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

const LABEL_W = 64;
const ROW_H = 16;
const GAP = 4;
const AXIS_H = 22;
const W = 760;

export default function StatusTimeline({ rows, fromMs, toMs, ariaLabel }: { rows: TimelineRow[]; fromMs: number; toMs: number; ariaLabel: string }) {
  const plotW = W - LABEL_W;
  const x = (t: number) => LABEL_W + ((t - fromMs) / (toMs - fromMs)) * plotW;
  const ticks = useMemo(() => {
    const span = toMs - fromMs;
    const stepH = span <= 3 * 3_600_000 ? 0.5 : span <= 8 * 3_600_000 ? 1 : span <= 30 * 3_600_000 ? 3 : 12;
    const step = stepH * 3_600_000;
    const out: number[] = [];
    for (let t = Math.ceil(fromMs / step) * step; t <= toMs; t += step) out.push(t);
    return out;
  }, [fromMs, toMs]);
  const multiDay = toMs - fromMs > 30 * 3_600_000;
  const h = rows.length * (ROW_H + GAP) + AXIS_H;

  return (
    <div className="rmd-timeline">
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" role="img" aria-label={ariaLabel} preserveAspectRatio="none">
        {rows.map((r, i) => {
          const y = i * (ROW_H + GAP);
          const step = r.points.length > 1 ? r.points[1][0] - r.points[0][0] : (toMs - fromMs);
          return (
            <g key={r.id}>
              <text x={LABEL_W - 8} y={y + ROW_H / 2} className="rmd-tl-label" textAnchor="end" dominantBaseline="central">{r.label}</text>
              <rect x={LABEL_W} y={y} width={plotW} height={ROW_H} className="rmd-tl-track" rx={2} />
              {r.points.map(([t, v]) => (v === null || v <= 0 ? null : (
                <rect key={t} x={x(t)} y={y} width={Math.max(0.6, x(t + step) - x(t))} height={ROW_H}
                  className="rmd-tl-on" style={{ opacity: Math.max(0.25, v / 100) }} />
              )))}
            </g>
          );
        })}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={0} y2={h - AXIS_H + 2} className="rmd-tl-grid" />
            <text x={x(t)} y={h - 6} className="rmd-tl-tick" textAnchor="middle">
              {multiDay ? `${DAY.format(t)} ${TIME.format(t)}` : TIME.format(t)}
            </text>
          </g>
        ))}
      </svg>
      <p className="rmd-tl-legend"><i className="rmd-tl-key" aria-hidden /> running · blank = off or no reading · times IST</p>
    </div>
  );
}
