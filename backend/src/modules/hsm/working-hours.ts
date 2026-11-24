/**
 * HSM working hours from the Shift Setup Checklist (the user, 24 Nov 2026): each entry's Shift start time
 * and Shift end time give a window of the plant day it is filed for; the Production card's Influx figure is
 * the counter's production inside the day's windows.
 *
 *   Window       Date D, HH:MM IST. A time from 08:00 is on D, an earlier one on D + 1 (the plant day runs
 *                08:00 → 08:00); an end at or before its start is the next day (20:00 → 08:00).
 *   Two entries  a Day and a Night entry: both windows count, the gap between them does not (the user).
 *   No entry     no window, so the day's working-hours production is NA (the user) — not the full day.
 *   One entry per Date + Shift, the latest saved (saveSetup updates in place by Date|Shift).
 */
import type { Env } from '../../config/env';
import type { WorkingWindow } from '../../contracts';
import { fetchFormEntries, type InsightEntry } from '../../integrations/logbook/client';
import { MSG } from '../../shared/messages';
import { SETUP_FORM, tagOf } from '../forms-db/forms';
import { DAY_MS, PLANT_DAY_START_HOUR, round2, type Increment } from './production.service';

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const IST = '+05:30';
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** One window in ms, from a checklist entry's plant date and its two times; null when a time is missing or bad. */
export function windowOf(date: string, shift: string, start: string, end: string): (WorkingWindow & { startMs: number; endMs: number }) | null {
  const s = TIME.exec(start);
  const e = TIME.exec(end);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !s || !e) return null;
  const startDay = Number(s[1]) < PLANT_DAY_START_HOUR ? addDays(date, 1) : date;
  const startMs = Date.parse(`${startDay}T${start}:00${IST}`);
  let endMs = Date.parse(`${startDay}T${end}:00${IST}`);
  if (endMs <= startMs) endMs += DAY_MS;
  return { shift, start, end, startMs, endMs };
}

/** Production inside the windows: the counter's increases with start < t ≤ end of any window. */
export function productionIn(ticks: Increment[], windows: { startMs: number; endMs: number }[]): number {
  return round2(ticks.reduce((a, p) => (windows.some((w) => p.t > w.startMs && p.t <= w.endMs) ? a + p.v : a), 0));
}

export interface ShiftWindows {
  connection: 'up' | 'down';
  message: string;
  /** Plant date → its windows, in order of start. */
  byDate: Map<string, (WorkingWindow & { startMs: number; endMs: number })[]>;
}

/** The checklist's windows for the plant dates from → to. */
export async function readShiftWindows(env: Env, from: string, to: string): Promise<ShiftWindows> {
  const byDate: ShiftWindows['byDate'] = new Map();
  // Filled on or after the day it is for; a few days early covers one filled ahead.
  const read = await fetchFormEntries(tagOf(SETUP_FORM), Date.parse(`${from}T00:00:00${IST}`) - 7 * DAY_MS, env);
  if (!read.ok) return { connection: 'down', message: read.message, byDate };
  const at = (r: InsightEntry) => String((r.metadata as { editedAt?: string } | undefined)?.editedAt ?? r.createdAt ?? r.invocationTime ?? '');
  const latest = new Map<string, Record<string, unknown>>();
  for (const r of [...read.rows].sort((a, b) => at(a).localeCompare(at(b)))) {
    const v = r.result ?? {};
    const date = String(v.Date ?? '').slice(0, 10);
    const shift = String(v.Shift ?? '').trim();
    if (date >= from && date <= to && shift) latest.set(`${date}|${shift}`, v);
  }
  for (const v of latest.values()) {
    const w = windowOf(String(v.Date).slice(0, 10), String(v.Shift).trim(), String(v['Shift start time'] ?? ''), String(v['Shift end time'] ?? ''));
    if (!w) continue;
    const date = String(v.Date).slice(0, 10);
    byDate.set(date, [...(byDate.get(date) ?? []), w].sort((a, b) => a.startMs - b.startMs));
  }
  return { connection: 'up', message: MSG.LOGBOOK_UP, byDate };
}
