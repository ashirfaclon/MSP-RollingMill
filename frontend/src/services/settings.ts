'use client';

/**
 * Plant settings (the user, 19 Nov 2026): every limit a mill's readings are judged by — the backend's
 * defaults (config/limits.ts) overlaid with the edits saved from the Settings screen. The cards colour
 * a reading against the same limits the alerts will raise on: inside green, outside amber, far
 * outside (the backend's `critical`) red.
 */
import { useApi, type LimitSetting, type MillSettings } from './hsmApi';

export type SettingsMill = MillSettings['mill'];
export const settingsUrl = (mill: SettingsMill) => `/api/settings/${mill}`;

export function useMillSettings(mill: SettingsMill) {
  const url = settingsUrl(mill);
  const s = useApi<MillSettings>(url);
  const data = s.dataUrl === url ? s.data : null;
  const byId = new Map((data?.limits ?? []).map((l) => [l.id, l]));
  return { data, error: s.error, limit: (id: string) => byId.get(id) ?? null };
}

export type Tone = 'v-ok' | 'v-warn' | 'v-risk';

/** A reading against its limit: v-ok inside, v-warn outside, v-risk far outside; undefined without a reading or a limit. */
export function toneOf(value: number | null | undefined, l: LimitSetting | null | undefined): Tone | undefined {
  if (value == null || !l || (l.min === null && l.max === null)) return undefined;
  if (l.min !== null && value < l.min) return l.critical.below !== null && value <= l.critical.below ? 'v-risk' : 'v-warn';
  if (l.max !== null && value > l.max) return l.critical.above !== null && value >= l.critical.above ? 'v-risk' : 'v-warn';
  return 'v-ok';
}

const RANK: Record<Tone, number> = { 'v-ok': 0, 'v-warn': 1, 'v-risk': 2 };
/** The worst of several readings' tones (a card over many readings); undefined when none was judged. */
export function worstTone(tones: (Tone | undefined)[]): Tone | undefined {
  return tones.reduce<Tone | undefined>((w, t) => (t && (!w || RANK[t] > RANK[w]) ? t : w), undefined);
}

/** A limit as the drill-downs print it: "45–65 °C", "max 75 °C", "min 2.5 kg/cm²", "—". */
export function limitText(l: LimitSetting | null | undefined): string {
  if (!l || (l.min === null && l.max === null)) return '—';
  const u = l.unit.startsWith('%') ? l.unit : ` ${l.unit}`;
  if (l.min !== null && l.max !== null) return `${l.min}–${l.max}${u}`;
  return l.max !== null ? `max ${l.max}${u}` : `min ${l.min}${u}`;
}

/** Open the Settings screen from anywhere (a drill-down's "Edit limits"), at one limit when given. */
export const OPEN_SETTINGS_EVENT = 'rm-open-settings';
export const openSettings = (limitId?: string) => window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: limitId ?? null }));
