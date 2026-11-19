/**
 * The one checker (SETTINGS_AND_ALERTS_REPLICATION.md §4): walks one point's readings, oldest first,
 * against its limit and returns every crossing — one continuous stretch past the limit.
 *
 *   No limit           nothing (the app never invents one, §5)
 *   Raise              after `onDelayReadings` readings past the limit in a row
 *   Deadband           while open, a reading must come back inside by the margin to count as normal:
 *                      a % of the band (a one-sided limit's band is 15 % of it, as `criticalOf`) or an amount
 *   Clear              on the first reading back inside by the margin (hand-filed readings are deliberate)
 *   Critical           a reading as far past as Settings' critical (one band width; 15 % past a one-sided
 *                      limit), or past the limit for ESCALATE_DAYS days running; else warning
 *
 * A crossing is stamped with its first reading past the limit, which never moves, so a standing
 * crossing keeps one identity however often it is checked (§5).
 */
import type { AlertControls, LimitSetting } from '../../contracts';
import { judge } from '../settings/settings.store';

/** Past the limit this many days running: critical. */
export const ESCALATE_DAYS = 7;
const DAY_MS = 86_400_000;

export type Band = Pick<LimitSetting, 'min' | 'max' | 'critical'>;
export interface Point { value: number; day: string; at: string }
export interface Crossing {
  since: string;
  sinceDay: string;
  lastAt: string;
  lastDay: string;
  /** Readings past the limit. */
  readings: number;
  /** The latest reading of the crossing, and the one furthest past the limit. */
  value: number;
  worst: number;
  severity: 'warning' | 'critical';
  active: boolean;
  /** The reading that brought it back inside. */
  clearedAt: string | null;
  clearedDay: string | null;
}

/** The re-arm margin, in the limit's unit. */
export function marginOf(l: Band, deadband: AlertControls['deadband']): number {
  if (deadband.mode === 'absolute') return deadband.value;
  const width = l.min !== null && l.max !== null ? l.max - l.min : Math.abs((l.max ?? l.min)!) * 0.15;
  return (deadband.value / 100) * width;
}

/** How far past the limit (in its unit; 0 inside). */
const pastBy = (v: number, l: Band) => Math.max(l.min !== null ? l.min - v : 0, l.max !== null ? v - l.max : 0, 0);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

export function crossings(points: Point[], l: Band | null, ctl: Pick<AlertControls, 'onDelayReadings' | 'deadband'>): Crossing[] {
  if (!l || (l.min === null && l.max === null)) return [];
  const margin = marginOf(l, ctl.deadband);
  // Back inside by the margin; a band narrower than two margins re-arms at its middle.
  const lo = l.min === null ? null : l.max === null ? l.min + margin : Math.min(l.min + margin, (l.min + l.max) / 2);
  const hi = l.max === null ? null : l.min === null ? l.max - margin : Math.max(l.max - margin, (l.min + l.max) / 2);
  const normal = (v: number) => (lo === null || v >= lo) && (hi === null || v <= hi);

  const out: Crossing[] = [];
  let open: Crossing | null = null;
  let pending: { p: Point; critical: boolean }[] = [];
  for (const p of points) {
    const j = judge(p.value, l)!;
    const past = j.status !== 'ok';
    const critical = j.severity === 'critical';
    if (open) {
      if (!past && normal(p.value)) {
        open.active = false; open.clearedAt = p.at; open.clearedDay = p.day;
        open = null;
        continue;
      }
      // Still past, or inside but within the margin: the crossing goes on.
      open.lastAt = p.at; open.lastDay = p.day; open.value = p.value;
      if (past) {
        open.readings += 1;
        if (pastBy(p.value, l) > pastBy(open.worst, l)) open.worst = p.value;
        if (critical || daysBetween(open.sinceDay, p.day) >= ESCALATE_DAYS) open.severity = 'critical';
      }
      continue;
    }
    if (!past) { pending = []; continue; }
    pending.push({ p, critical });
    if (pending.length < ctl.onDelayReadings) continue;
    const first = pending[0].p;
    const worst = pending.reduce((w, x) => (pastBy(x.p.value, l) > pastBy(w, l) ? x.p.value : w), first.value);
    open = {
      since: first.at, sinceDay: first.day, lastAt: p.at, lastDay: p.day, readings: pending.length,
      value: p.value, worst,
      severity: pending.some((x) => x.critical) || daysBetween(first.day, p.day) >= ESCALATE_DAYS ? 'critical' : 'warning',
      active: true, clearedAt: null, clearedDay: null,
    };
    out.push(open);
    pending = [];
  }
  return out;
}
