/**
 * The two axes of navigation: which mill (top-bar dropdown) and which screen of it
 * (sidebar). Both live in the URL — `/{mill}/{screen}` — so any view can be linked to
 * and a reload lands where the reader was.
 */
import type { IconId } from '@/components/Icon';

export const MILLS = [
  { id: 'hsm', code: 'HSM' },
  { id: 'lsm', code: 'LSM' },
  { id: 'rmd', code: 'RMD' },
  { id: 'rms', code: 'RMS' },
] as const;

export type MillId = (typeof MILLS)[number]['id'];

export const SCREENS = [
  {
    id: 'visualization',
    label: 'Visualization',
    sub: 'Production · Flow',
    icon: 'bars',
    blurb: 'Production, yield, energy, order-linked stock and mill flow',
  },
  {
    id: 'condition-analytics',
    label: 'Condition Analytics',
    sub: 'Process · Deviations',
    icon: 'trend',
    blurb: 'Process condition against operating bands',
  },
  {
    id: 'asset-health',
    label: 'Asset Health',
    sub: 'Condition · Diagnostics',
    icon: 'shield-check',
    blurb: 'Equipment condition and maintenance',
  },
  {
    id: 'data-model',
    label: 'Data Model',
    sub: 'Flow · Ledgers · Checks',
    icon: 'database',
    blurb: 'Material flow, run time, stock and orders behind every KPI — and whether they balance',
  },
] as const satisfies readonly { id: string; label: string; sub: string; icon: IconId; blurb: string }[];

export type ScreenId = (typeof SCREENS)[number]['id'];

export const DEFAULT_MILL: MillId = 'hsm';
export const DEFAULT_SCREEN: ScreenId = 'visualization';

export const isMill = (v: string): v is MillId => MILLS.some((m) => m.id === v);
export const isScreen = (v: string): v is ScreenId => SCREENS.some((s) => s.id === v);

export const millOf = (id: MillId) => MILLS.find((m) => m.id === id)!;
export const screenOf = (id: ScreenId) => SCREENS.find((s) => s.id === id)!;

export const pathFor = (mill: MillId, screen: ScreenId) => `/${mill}/${screen}`;
