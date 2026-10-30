'use client';

/**
 * A card's sparkline: the period's readings as one thin line in the card's own colour, no axes,
 * stretched to the card's width (the user's reference, 30 Oct 2026). A gap in the readings is a
 * gap in the line — a missing reading is never drawn as zero. Hovering shows the nearest reading:
 * a dot on the line and a tooltip with its time and value.
 */
import { useRef, useState, type MouseEvent } from 'react';

const AT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });

export interface SparkData {
  values: (number | null)[];
  /** The time of each value (ms), for the tooltip. */
  times?: number[];
  label: string;
  unit?: string;
  dp?: number;
}

export default function Sparkline({ values, times, label, unit = '', dp = 2 }: SparkData) {
  const ref = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (nums.length < 2) return <span className="rm-spark rm-spark--empty" aria-hidden />;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const span = hi - lo || 1;
  const n = values.length;
  const xOf = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const yOf = (v: number) => 22 - ((v - lo) / span) * 20;
  /* One path per unbroken run of readings. */
  const runs: string[] = [];
  let run = '';
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) { if (run) runs.push(run); run = ''; return; }
    run += `${run ? 'L' : 'M'}${xOf(i).toFixed(2)} ${yOf(v).toFixed(2)}`;
  });
  if (run) runs.push(run);

  /* The reading nearest the pointer that has a value. */
  const onMove = (e: MouseEvent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return;
    const at = Math.round(((e.clientX - box.left) / box.width) * (n - 1));
    let best: number | null = null;
    for (let d = 0; d < n; d += 1) {
      for (const i of [at - d, at + d]) {
        if (i >= 0 && i < n && values[i] !== null && Number.isFinite(values[i]!)) { best = i; break; }
      }
      if (best !== null) break;
    }
    setHover(best);
  };
  const hv = hover === null ? null : values[hover];
  const leftPct = hover === null ? 0 : xOf(hover);

  return (
    <span ref={ref} className="rm-spark-wrap" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg className="rm-spark" viewBox="0 0 100 24" preserveAspectRatio="none" role="img" aria-label={label}>
        {runs.map((d, i) => <path key={i} d={d} />)}
      </svg>
      {hover !== null && hv !== null && hv !== undefined && (
        <>
          <span className="rm-spark-dot" style={{ left: `${leftPct}%`, top: `${(yOf(hv) / 24) * 100}%` }} aria-hidden />
          <span className={`rm-spark-tip${leftPct > 60 ? ' is-left' : ''}`} style={{ left: `${leftPct}%` }} role="tooltip">
            {times?.[hover] !== undefined && <span className="rm-spark-tip-at">{AT.format(new Date(times[hover]))} IST</span>}
            <b>{hv.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })}{unit ? ` ${unit}` : ''}</b>
          </span>
        </>
      )}
    </span>
  );
}
