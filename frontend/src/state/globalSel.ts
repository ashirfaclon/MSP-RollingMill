/**
 * Global selection shared by every mill and screen: the duration window and the theme.
 *
 * Ported from pellet-frontend's `state/globalSel.ts` — a tiny module store on
 * useSyncExternalStore + localStorage, no state library. The mill and the screen are NOT
 * here: they live in the URL (see config/navigation.ts).
 *
 * Plant time is IST throughout; shifts are A 06–14, B 14–22, C 22–06.
 */
import { useSyncExternalStore } from 'react';
import { SEL_STORAGE_KEY } from './storageKey';

export type DurationPreset =
  | 'custom' | 'current_shift'
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
  /** Explicit window, in epoch ms, used when duration is 'custom'. */
  customFromMs: number | null;
  customToMs: number | null;
  theme: ThemeSel;
  sidebar: SidebarSel;
}

const DEFAULTS: GlobalSel = { duration: 'today', customFromMs: null, customToMs: null, theme: 'dark', sidebar: 'expanded' };

function load(): GlobalSel {
  try {
    const raw = localStorage.getItem(SEL_STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
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

export const DURATION_LABELS: Record<DurationPreset, string> = {
  custom: 'Custom',
  current_shift: 'Current Shift',
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

const IST_OFFSET_MIN = 330;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Start of the IST day containing `nowMs`, in UTC ms. */
function istDayStart(nowMs: number): number {
  const ist = new Date(nowMs + IST_OFFSET_MIN * 60_000);
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MIN * 60_000;
}

/** The plant shift containing `nowMs`. */
export function shiftWindowAt(nowMs: number): { name: 'A' | 'B' | 'C'; fromMs: number; toMs: number } {
  const h = new Date(nowMs + IST_OFFSET_MIN * 60_000).getUTCHours();
  const d0 = istDayStart(nowMs);
  if (h >= 6 && h < 14) return { name: 'A', fromMs: d0 + 6 * HOUR, toMs: d0 + 14 * HOUR };
  if (h >= 14 && h < 22) return { name: 'B', fromMs: d0 + 14 * HOUR, toMs: d0 + 22 * HOUR };
  const start = h >= 22 ? d0 + 22 * HOUR : d0 - 2 * HOUR;
  return { name: 'C', fromMs: start, toMs: start + 8 * HOUR };
}

/** The window a preset resolves to at `nowMs`. `custom` has none — the caller supplies it. */
export function presetRange(preset: DurationPreset, nowMs: number): { fromMs: number; toMs: number } | null {
  if (preset === 'custom') return null;
  if (preset === 'current_shift') {
    const w = shiftWindowAt(nowMs);
    return { fromMs: w.fromMs, toMs: nowMs };
  }
  const d0 = istDayStart(nowMs);
  const ist = new Date(nowMs + IST_OFFSET_MIN * 60_000);
  const dow = (ist.getUTCDay() + 6) % 7; // Monday = 0
  const off = IST_OFFSET_MIN * 60_000;
  const monthStart = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - off;
  const yearStart = Date.UTC(ist.getUTCFullYear(), 0, 1) - off;
  switch (preset) {
    case 'today': return { fromMs: d0, toMs: nowMs };
    case 'yesterday': return { fromMs: d0 - DAY, toMs: d0 };
    case 'current_week': return { fromMs: d0 - dow * DAY, toMs: nowMs };
    case 'previous_week': return { fromMs: d0 - (dow + 7) * DAY, toMs: d0 - dow * DAY };
    case 'previous_7_days': return { fromMs: d0 - 7 * DAY, toMs: d0 };
    case 'current_month': return { fromMs: monthStart, toMs: nowMs };
    case 'previous_month':
      return { fromMs: Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - 1, 1) - off, toMs: monthStart };
    case 'previous_3_months':
      return { fromMs: Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - 3, 1) - off, toMs: monthStart };
    case 'previous_12_months':
      return { fromMs: Date.UTC(ist.getUTCFullYear() - 1, ist.getUTCMonth(), 1) - off, toMs: monthStart };
    case 'current_year': return { fromMs: yearStart, toMs: nowMs };
    case 'previous_year':
      return { fromMs: Date.UTC(ist.getUTCFullYear() - 1, 0, 1) - off, toMs: yearStart };
  }
}
