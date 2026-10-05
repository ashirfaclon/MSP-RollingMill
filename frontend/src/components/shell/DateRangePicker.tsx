'use client';

/**
 * Duration picker: preset list on the left, start/end date and a month calendar on the
 * right, Cancel / Apply at the foot. Ported from pellet-frontend.
 *
 * Dates only — no time of day. Every date is a plant day, 06:00 IST to 06:00 IST the next
 * day (lib/plantDay.ts): picking 24 Sep means 24 Sep 06:00 → 25 Sep 06:00. The cycle each
 * choice covers is shown beside the dates and on the trigger, so nobody has to remember it.
 *
 * A preset fills the dates so you can see what it resolves to before applying; editing a
 * date switches to Custom — the dates are the source of truth, presets are shortcuts.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DURATION_LABELS, presetDates, selectedDates, setGlobalSel, useGlobalSel, type DurationPreset,
} from '@/state/globalSel';
import { PLANT_DAY_START, addDays, cycleLabel, dayCount, dm, isDate, plantDate } from '@/lib/plantDay';
import { useMinute } from '@/services/hsmProduction';
import './daterange.css';

const ORDER: DurationPreset[] = [
  'custom', 'today', 'yesterday',
  'current_week', 'previous_week', 'previous_7_days',
  'current_month', 'previous_month', 'previous_3_months',
  'previous_12_months', 'current_year', 'previous_year',
];

export default function DateRangePicker() {
  const sel = useGlobalSel();
  const now = useMinute();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const [preset, setPreset] = useState<DurationPreset>(sel.duration);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [month, setMonth] = useState(() => new Date(0));
  /** True between the first and second click of a range selection. */
  const [anchored, setAnchored] = useState(false);
  /** The clock when the picker opened — fixes "today" and the presets while it is up. */
  const [openedAt, setOpenedAt] = useState(0);
  const today = openedAt ? plantDate(openedAt) : '';

  /** Seed the form from the active selection each time the picker opens. */
  const openPicker = () => {
    const nowMs = Date.now();
    const t = plantDate(nowMs);
    const active = selectedDates(sel, nowMs) ?? { from: t, to: t };
    setPreset(sel.duration);
    setFrom(active.from);
    setTo(active.to);
    setMonth(new Date(`${active.from.slice(0, 7)}-01T00:00:00Z`));
    setAnchored(false);
    setOpenedAt(nowMs);
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
    const r = p === 'custom' ? null : presetDates(p, openedAt);
    if (r) { setFrom(r.from); setTo(r.to); setMonth(new Date(`${r.from.slice(0, 7)}-01T00:00:00Z`)); }
  };

  const edit = (which: 'from' | 'to', value: string) => {
    setPreset('custom');                       // touching a date means custom
    (which === 'from' ? setFrom : setTo)(value);
  };

  /**
   * Two-click range selection. The first click starts a new range (start = end = that
   * day); the second closes it, swapping if you picked backwards.
   */
  const pickDay = (key: string) => {
    setPreset('custom');
    if (!anchored) {
      setFrom(key);
      setTo(key);
      setAnchored(true);
      return;
    }
    if (key < from) { setTo(from); setFrom(key); } else setTo(key);
    setAnchored(false);
  };

  const problem = !isDate(from) || !isDate(to) ? 'Choose a start and an end date.'
    : to < from ? 'End date must not be before start date.'
    : from > today ? 'Start date is in the future.'
    : null;

  const apply = () => {
    if (problem) return;
    setGlobalSel({
      duration: preset,
      customFrom: preset === 'custom' ? from : null,
      customTo: preset === 'custom' ? to : null,
    });
    setOpen(false);
  };

  /* ---- month grid ---- */
  const grid = useMemo(() => {
    const y = month.getUTCFullYear(); const m = month.getUTCMonth();
    const lead = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const cells: Array<{ day: number; key: string } | null> = Array(lead).fill(null);
    for (let d = 1; d <= days; d += 1) cells.push({ day: d, key: new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10) });
    return cells;
  }, [month]);

  // The trigger: the preset's name (if any) and the cycle it covers, e.g.
  // "Today · 1 Oct 06:00 → 2 Oct 06:00", or just the cycle for a custom range.
  const active = selectedDates(sel, now);
  const cycle = active ? cycleLabel(active.from, active.to) : '';
  const name = sel.duration === 'custom' ? null : DURATION_LABELS[sel.duration];

  return (
    <div className="dr" ref={box}>
      <button
        className="dr-trigger"
        onClick={() => (open ? setOpen(false) : openPicker())}
        title="Select period — each day runs 06:00 to 06:00"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="dr-trigger-k">Duration</span>
        {name && <span className="dr-trigger-v" suppressHydrationWarning>{name}</span>}
        {cycle && <span className="dr-trigger-cycle num" suppressHydrationWarning>{cycle}</span>}
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
                <span className="dr-f-row">
                  <input type="date" value={from} max={today} onChange={(e) => edit('from', e.target.value)} />
                  <span className="dr-f-cycle num" aria-hidden>from {PLANT_DAY_START}</span>
                </span>
              </label>
              <label className="dr-f">
                <span>End Date <i>*</i></span>
                <span className="dr-f-row">
                  <input type="date" value={to} max={today} onChange={(e) => edit('to', e.target.value)} />
                  <span className="dr-f-cycle num" aria-hidden>
                    to {isDate(to) ? dm(addDays(to, 1)) : 'next day'} {PLANT_DAY_START}
                  </span>
                </span>
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
                  const isFrom = c.key === from; const isTo = c.key === to;
                  const inRange = c.key > from && c.key < to;
                  return (
                    <button
                      key={i}
                      disabled={c.key > today}
                      className={`${isFrom || isTo ? 'sel' : ''}${inRange ? ' in' : ''}${c.key === today ? ' today' : ''}`}
                      onClick={() => pickDay(c.key)}
                      title={cycleLabel(c.key, c.key)}
                    >
                      {c.day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="dr-foot">
              <span className="dr-hint" role="status">
                {problem
                  ? <b className="dr-bad">{problem}</b>
                  : <><b className="num">{cycleLabel(from, to)}</b> · {dayCount(from, to)} plant day{dayCount(from, to) > 1 ? 's' : ''} · IST</>}
              </span>
              <span className="dr-btns">
                <button className="ghost" onClick={() => setOpen(false)}>Cancel</button>
                <button className="primary" disabled={!!problem} onClick={apply}>Apply</button>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
