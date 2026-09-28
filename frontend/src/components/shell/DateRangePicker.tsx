'use client';

/**
 * Duration picker: preset list on the left, explicit start/end date-time and a month
 * calendar on the right, Cancel / Apply at the foot. Ported from pellet-frontend.
 *
 * Plant time throughout. A preset fills the fields so you can see exactly which window
 * it resolves to before applying, and editing any field switches to Custom — the fields
 * are the source of truth, the presets are shortcuts to them.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DURATION_LABELS, presetRange, setGlobalSel, useGlobalSel, type DurationPreset,
} from '@/state/globalSel';
import './daterange.css';

const IST_OFF = 330 * 60_000;
const ORDER: DurationPreset[] = [
  'custom', 'current_shift', 'today', 'yesterday',
  'current_week', 'previous_week', 'previous_7_days',
  'current_month', 'previous_month', 'previous_3_months',
  'previous_12_months', 'current_year', 'previous_year',
];

type Parts = { date: string; time: string };

/** epoch ms -> the date/time strings the inputs use, in plant time. */
const toParts = (ms: number): Parts => {
  const d = new Date(ms + IST_OFF);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
    time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`,
  };
};
/** date + time strings in plant time -> epoch ms. */
const toMs = (date: string, time: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m || !t) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]) - IST_OFF;
};

/** Human length of the selected window — "8 h 00 m", "2 days 4 h". */
function spanLabel(fromMs: number, toMs: number): string {
  const mins = Math.max(0, Math.round((toMs - fromMs) / 60_000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d} day${d > 1 ? 's' : ''}${h ? ` ${h} h` : ''}`;
  return `${h} h ${String(m).padStart(2, '0')} m`;
}

export default function DateRangePicker() {
  const sel = useGlobalSel();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const [preset, setPreset] = useState<DurationPreset>(sel.duration);
  const [from, setFrom] = useState<Parts>({ date: '', time: '' });
  const [to, setTo] = useState<Parts>({ date: '', time: '' });
  const [month, setMonth] = useState(() => new Date(0));
  /** True between the first and second click of a range selection. */
  const [anchored, setAnchored] = useState(false);
  /** The clock as of opening — fixes "today" and the future cut-off while the picker is up. */
  const [nowMs, setNowMs] = useState(0);

  /** Seed the form from the active selection each time the picker opens. */
  const openPicker = () => {
    const now = Date.now();
    const active = sel.duration === 'custom' && sel.customFromMs !== null && sel.customToMs !== null
      ? { fromMs: sel.customFromMs, toMs: sel.customToMs }
      : presetRange(sel.duration, now) ?? { fromMs: now - 3_600_000, toMs: now };
    setPreset(sel.duration);
    setFrom(toParts(active.fromMs));
    setTo(toParts(active.toMs));
    setMonth(new Date(active.fromMs + IST_OFF));
    setAnchored(false);
    setNowMs(now);
    setOpen(true);
  };

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const pickPreset = (p: DurationPreset) => {
    setPreset(p);
    setAnchored(false);
    const r = p === 'custom' ? null : presetRange(p, nowMs);
    if (r) { setFrom(toParts(r.fromMs)); setTo(toParts(r.toMs)); setMonth(new Date(r.fromMs + IST_OFF)); }
  };

  const edit = (which: 'from' | 'to', field: 'date' | 'time', value: string) => {
    setPreset('custom');                       // touching a field means custom
    (which === 'from' ? setFrom : setTo)((v) => ({ ...v, [field]: value }));
  };

  /**
   * Two-click range selection. The first click starts a new range (start = end = that
   * day); the second closes it, swapping if you picked backwards.
   */
  const pickDay = (key: string) => {
    setPreset('custom');
    if (!anchored) {
      setFrom((v) => ({ ...v, date: key }));
      setTo((v) => ({ ...v, date: key }));
      setAnchored(true);
      return;
    }
    if (key < from.date) {
      setTo({ date: from.date, time: to.time });
      setFrom((v) => ({ ...v, date: key }));
    } else {
      setTo((v) => ({ ...v, date: key }));
    }
    setAnchored(false);
  };

  const fromMs = toMs(from.date, from.time);
  const toMsV = toMs(to.date, to.time);
  const invalid = fromMs === null || toMsV === null || toMsV <= fromMs;

  const apply = () => {
    if (invalid) return;
    setGlobalSel({
      duration: preset,
      customFromMs: preset === 'custom' ? fromMs : null,
      customToMs: preset === 'custom' ? toMsV : null,
    });
    setOpen(false);
  };

  /* ---- month grid ---- */
  const grid = useMemo(() => {
    const y = month.getUTCFullYear(); const m = month.getUTCMonth();
    const lead = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const cells: Array<{ day: number; ms: number } | null> = Array(lead).fill(null);
    for (let d = 1; d <= days; d += 1) cells.push({ day: d, ms: Date.UTC(y, m, d) - IST_OFF });
    return cells;
  }, [month]);

  const todayKey = toParts(nowMs).date;
  const label = sel.duration === 'custom' && sel.customFromMs !== null && sel.customToMs !== null
    ? `${toParts(sel.customFromMs).date} → ${toParts(sel.customToMs).date}`
    : DURATION_LABELS[sel.duration];

  return (
    <div className="dr" ref={box}>
      <button
        className="dr-trigger"
        onClick={() => (open ? setOpen(false) : openPicker())}
        title="Select period"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="dr-trigger-k">Duration</span>
        <span className="dr-trigger-v" suppressHydrationWarning>{label}</span>
        <span className="dr-caret">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="dr-pop" role="dialog" aria-label="Select period">
          <ul className="dr-presets">
            {ORDER.map((p) => (
              <li key={p}>
                <button className={p === preset ? 'on' : ''} onClick={() => pickPreset(p)}>
                  {DURATION_LABELS[p]}
                </button>
              </li>
            ))}
          </ul>

          <div className="dr-right">
            <div className="dr-fields">
              <label className="dr-f">
                <span>Start Date <i>*</i></span>
                <input type="date" value={from.date} onChange={(e) => edit('from', 'date', e.target.value)} />
              </label>
              <label className="dr-f">
                <span>Start Time <i>*</i></span>
                <input type="time" value={from.time} onChange={(e) => edit('from', 'time', e.target.value)} />
              </label>
              <label className="dr-f">
                <span>End Date <i>*</i></span>
                <input type="date" value={to.date} onChange={(e) => edit('to', 'date', e.target.value)} />
              </label>
              <label className="dr-f">
                <span>End Time <i>*</i></span>
                <input type="time" value={to.time} onChange={(e) => edit('to', 'time', e.target.value)} />
              </label>
            </div>

            <div className="dr-cal">
              <div className="dr-cal-head">
                <b>{month.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase()}</b>
                <span>
                  <button aria-label="Previous month" onClick={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))}>‹</button>
                  <button aria-label="Next month" onClick={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)))}>›</button>
                </span>
              </div>
              <div className="dr-dow">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
              <div className="dr-days">
                {grid.map((c, i) => {
                  if (!c) return <span key={i} />;
                  const key = toParts(c.ms).date;
                  const future = c.ms > nowMs;
                  const isFrom = key === from.date; const isTo = key === to.date;
                  const inRange = key > from.date && key < to.date;
                  const today = key === todayKey;
                  return (
                    <button
                      key={i}
                      disabled={future}
                      className={`${isFrom || isTo ? 'sel' : ''}${inRange ? ' in' : ''}${today ? ' today' : ''}`}
                      onClick={() => pickDay(key)}
                    >
                      {c.day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="dr-foot">
              <span className="dr-hint">
                {invalid
                  ? <b className="dr-bad">End must be after start.</b>
                  : <><b>{spanLabel(fromMs as number, toMsV as number)}</b> · plant time (IST)</>}
              </span>
              <span className="dr-btns">
                <button className="ghost" onClick={() => setOpen(false)}>Cancel</button>
                <button className="primary" disabled={invalid} onClick={apply}>Apply</button>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
