/**
 * Global selection shared by every mill and screen: the duration window and the theme.
 *
 * Ported from pellet-frontend's `state/globalSel.ts` — a tiny module store on
 * useSyncExternalStore + localStorage, no state library. The mill and the screen are NOT
 * here: they live in the URL (see config/navigation.ts).
 *
 * Plant time is IST throughout. The duration is held as PLANT DATES, and a plant date is the
 * cycle 06:00 → 06:00 next day (lib/plantDay.ts) — there is no time of day to choose.
 */
import { useSyncExternalStore } from 'react';
import { SEL_STORAGE_KEY } from './storageKey';
import { addDays, isDate, plantDate } from '@/lib/plantDay';

export type DurationPreset =
  | 'custom'
  | 'today' | 'yesterday'
  | 'current_week' | 'previous_week' | 'previous_7_days'
  | 'current_month' | 'previous_month'
  | 'previous_3_months' | 'previous_12_months'
  | 'current_year' | 'previous_year';

/** Control-room dark by default; light for daylight offices and printing. */
export type ThemeSel = 'dark' | 'light';

/** Screen rail: full labels, or an icon strip that gives the dashboard the width. */
export type SidebarSel = 'expanded' | 'collapsed';

export interface GlobalSel {
  duration: DurationPreset;
  /** First and last plant date (inclusive, YYYY-MM-DD), used when duration is 'custom'. */
  customFrom: string | null;
  customTo: string | null;
  theme: ThemeSel;
  sidebar: SidebarSel;
}

/** Declared before `load()` runs at module start, which validates a stored preset against it. */
export const DURATION_LABELS: Record<DurationPreset, string> = {
  custom: 'Custom',
  today: 'Today',
  yesterday: 'Yesterday',
  current_week: 'Current Week',
  previous_week: 'Previous Week',
  previous_7_days: 'Previous 7 Days',
  current_month: 'Current Month',
  previous_month: 'Previous Month',
  previous_3_months: 'Previous 3 Months',
  previous_12_months: 'Previous 12 Months',
  current_year: 'Current Year',
  previous_year: 'Previous Year',
};

const DEFAULTS: GlobalSel = { duration: 'today', customFrom: null, customTo: null, theme: 'dark', sidebar: 'expanded' };

/**
 * A stored selection from before plant dates (an epoch-ms window, or the retired
 * current-shift preset) is converted rather than dropped: the window becomes the plant
 * dates it started and ended in.
 */
function load(): GlobalSel {
  try {
    const raw = localStorage.getItem(SEL_STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const { customFromMs, customToMs, ...rest } = JSON.parse(raw) as Partial<GlobalSel> & { customFromMs?: number | null; customToMs?: number | null };
    const sel: GlobalSel = { ...DEFAULTS, ...rest };
    if (typeof customFromMs === 'number' && typeof customToMs === 'number' && !sel.customFrom) {
      sel.customFrom = plantDate(customFromMs);
      sel.customTo = plantDate(Math.max(customFromMs, customToMs - 1));
    }
    if (!(sel.duration in DURATION_LABELS)) sel.duration = 'today';
    if (sel.duration === 'custom' && !(sel.customFrom && sel.customTo && isDate(sel.customFrom) && isDate(sel.customTo))) {
      sel.duration = 'today';
    }
    return sel;
  } catch { /* SSR or storage blocked: fall through */ }
  return DEFAULTS;
}

let state: GlobalSel = typeof window === 'undefined' ? DEFAULTS : load();
const listeners = new Set<() => void>();

export function setGlobalSel(patch: Partial<GlobalSel>) {
  state = { ...state, ...patch };
  // Theme and rail state are attributes on <html>, so CSS alone restyles everything at once
  // (and the inline script in app/layout.tsx can set them before first paint).
  if (patch.theme) document.documentElement.dataset.theme = patch.theme;
  if (patch.sidebar) document.documentElement.dataset.sidebar = patch.sidebar;
  try { localStorage.setItem(SEL_STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

/** The filters (not the theme or the rail) as they are by default. */
export const isDefaultFilter = (sel: GlobalSel) => sel.duration === DEFAULTS.duration;

/** Put the filters back to their defaults — Duration "Today". Theme and rail are kept. */
export function resetFilters() {
  setGlobalSel({ duration: DEFAULTS.duration, customFrom: DEFAULTS.customFrom, customTo: DEFAULTS.customTo });
}

/**
 * The server renders with the defaults; the client hydrates against the same defaults and
 * then re-renders with what was stored, so there is no hydration mismatch. The theme itself
 * is already on <html> before first paint (inline script), so nothing flashes.
 */
export function useGlobalSel(): GlobalSel {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => state,
    () => DEFAULTS,
  );
}


/**
 * The plant dates (inclusive) a preset covers at `nowMs`. "Today" is the plant day running
 * now — at 03:00 IST that is still yesterday's date, whose cycle ends at 06:00.
 * `custom` has none — the caller supplies it.
 */
export function presetDates(preset: DurationPreset, nowMs: number): { from: string; to: string } | null {
  if (preset === 'custom') return null;
  const t = plantDate(nowMs);
  const y = Number(t.slice(0, 4));
  const m = Number(t.slice(5, 7));
  const monday = addDays(t, -((new Date(`${t}T00:00:00Z`).getUTCDay() + 6) % 7));
  /** First of the month `back` months before t's month. */
  const monthStart = (back: number) => new Date(Date.UTC(y, m - 1 - back, 1)).toISOString().slice(0, 10);
  switch (preset) {
    case 'today': return { from: t, to: t };
    case 'yesterday': return { from: addDays(t, -1), to: addDays(t, -1) };
    case 'current_week': return { from: monday, to: t };
    case 'previous_week': return { from: addDays(monday, -7), to: addDays(monday, -1) };
    case 'previous_7_days': return { from: addDays(t, -7), to: addDays(t, -1) };
    case 'current_month': return { from: monthStart(0), to: t };
    case 'previous_month': return { from: monthStart(1), to: addDays(monthStart(0), -1) };
    case 'previous_3_months': return { from: monthStart(3), to: addDays(monthStart(0), -1) };
    case 'previous_12_months': return { from: monthStart(12), to: addDays(monthStart(0), -1) };
    case 'current_year': return { from: `${y}-01-01`, to: t };
    case 'previous_year': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  }
}

/** The selection as plant dates (inclusive); null before the clock is known. */
export function selectedDates(sel: GlobalSel, nowMs: number): { from: string; to: string } | null {
  if (!nowMs) return null;
  if (sel.duration === 'custom') return sel.customFrom && sel.customTo ? { from: sel.customFrom, to: sel.customTo } : null;
  return presetDates(sel.duration, nowMs);
}
