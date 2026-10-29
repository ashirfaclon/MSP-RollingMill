/**
 * Signal quality (mill-mimic-improvement-spec C2): every reading carries its source time and
 * a quality the UI computes and never receives. Unknown, stale, doubtful and zero are four
 * different facts and each is drawn differently; `null` never becomes 0.
 */
import type { SignalSpec } from './twinSignals';

export type Quality = 'good' | 'stale' | 'suspect' | 'missing';

export interface Signal<T = number> {
  value: T | null;
  /** Source timestamp (ms epoch) — the historian's, not the browser's receive time. */
  ts: number | null;
  quality: Quality;
}

export const MISSING: Signal = { value: null, ts: null, quality: 'missing' };

export function assess(raw: { value: number | null; ts: number | null }, spec: SignalSpec, now: number): Signal {
  if (raw.value === null || raw.ts === null || !Number.isFinite(raw.value)) return { value: raw.value, ts: raw.ts, quality: 'missing' };
  if (now - raw.ts > spec.staleAfterMs) return { ...raw, quality: 'stale' };
  if ((spec.min !== undefined && raw.value < spec.min - (spec.zeroBand ?? 0)) || (spec.max !== undefined && raw.value > spec.max)) {
    return { ...raw, quality: 'suspect' };
  }
  return { ...raw, quality: 'good' };
}

/** A boolean signal (running): the same staleness rule, no range. */
export function assessFlag(raw: { value: boolean | null; ts: number | null }, spec: SignalSpec, now: number): Signal<boolean> {
  if (raw.value === null || raw.ts === null) return { value: raw.value, ts: raw.ts, quality: 'missing' };
  if (now - raw.ts > spec.staleAfterMs) return { ...raw, quality: 'stale' };
  return { ...raw, quality: 'good' };
}

/** The value as a figure only while the signal is good — what `flowOf` and `load` may use. */
export const good = (s: Signal | null | undefined): number | null => (s && s.quality === 'good' ? s.value : null);
/** Running only when known for sure; stale or missing is UNKNOWN (null), never false. */
export const runningOf = (s: Signal<boolean>): boolean | null => (s.quality === 'good' ? s.value : null);

/** "3m", "45s", "2h": how old a stale reading is. */
export function ageOf(ts: number | null, now: number): string {
  if (ts === null) return '';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m`;
  return `${Math.round(m / 60)}h`;
}

/**
 * How a reading is written (spec C2): a good value plainly; within a confirmed zero band
 * "≈0"; stale in grey with its age; suspect with "?"; missing "NA".
 */
export function readingText(s: Signal, spec: SignalSpec, now: number, dp = 0): { text: string; suffix: string; quality: Quality } {
  const fmt = (v: number) => v.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  if (s.quality === 'missing' || s.value === null) return { text: 'NA', suffix: '', quality: 'missing' };
  if (s.quality === 'suspect') return { text: `${fmt(s.value)} ?`, suffix: '', quality: 'suspect' };
  const v = spec.zeroBand !== undefined && Math.abs(s.value) <= spec.zeroBand ? '≈0' : fmt(s.value);
  if (s.quality === 'stale') return { text: v, suffix: ` · ${ageOf(s.ts, now)}`, quality: 'stale' };
  return { text: v, suffix: '', quality: 'good' };
}

/* ------------------------------ period labels ----------------------------- */

const IST = 'Asia/Kolkata';
const HM = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: IST });
const DM = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: IST });
const DAY = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: IST });

/** An accumulation period: what it is called and when it started. */
export interface Period { label: string; start: number }

/**
 * "SINCE 09:00 IST" on the day it started; "SINCE 29 OCT 09:00 IST" once the calendar day has
 * turned (spec C7), so a count shown at 01:38 is never mistaken for one from this morning.
 */
export function periodLabel(p: Period | null, now: number): string {
  if (!p) return '';
  const sameDay = DAY.format(new Date(p.start)) === DAY.format(new Date(now));
  return sameDay ? `SINCE ${HM.format(new Date(p.start))} IST` : `SINCE ${DM.format(new Date(p.start)).toUpperCase()} ${HM.format(new Date(p.start))} IST`;
}
