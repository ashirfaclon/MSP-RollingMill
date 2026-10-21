/**
 * The two axes of navigation: which mill (top-bar dropdown) and which screen of it
 * (sidebar). Both live in the URL — `/{mill}/{screen}` — so any view can be linked to
 * and a reload lands where the reader was.
 */
import type { IconId } from '@/components/Icon';

export const MILLS = [
  { id: 'hsm', code: 'HSM' },
  { id: 'rmd', code: 'RMD' },
  { id: 'lsm', code: 'LSM' },
  { id: 'rms', code: 'RMS' },
] as const;

export type MillId = (typeof MILLS)[number]['id'];

export const SCREENS = [
  {
    id: 'visualization',
    label: 'Visualization',
    sub: 'Production · Flow',
    icon: 'bars',
  },
  {
    id: 'asset-health',
    label: 'Asset Health',
    sub: 'Condition · Maintenance',
    icon: 'gear',
    mills: ['hsm', 'rmd'],
  },
  {
    id: 'condition-analytics',
    label: 'Condition Analytics',
    sub: 'Rate · Cost · Condition',
    icon: 'trend',
    mills: ['rmd'],
  },
  {
    id: 'data-model',
    label: 'Data Model',
    sub: 'Flow · Ledgers · Checks',
    icon: 'database',
  },
] as const satisfies readonly { id: string; label: string; sub: string; icon: IconId; mills?: readonly MillId[] }[];

export type ScreenId = (typeof SCREENS)[number]['id'];

/**
 * Screens left out of the sidebar for now. The page still builds and opens from its direct
 * link (/{mill}/data-model); remove an id here to bring its tab back.
 */
export const HIDDEN_SCREENS: readonly ScreenId[] = ['data-model'];

/** The screens the sidebar lists. */
export const NAV_SCREENS = SCREENS.filter((s) => !HIDDEN_SCREENS.includes(s.id));

/** Whether a mill has this screen (a screen with `mills` exists only for those, e.g. Asset Health for HSM). */
export const hasScreen = (mill: MillId, screen: ScreenId) => {
  const s = screenOf(screen);
  return !('mills' in s) || (s.mills as readonly MillId[]).includes(mill);
};

/** The sidebar's screens for one mill. */
export const navScreens = (mill: MillId) => NAV_SCREENS.filter((s) => hasScreen(mill, s.id));

export const DEFAULT_MILL: MillId = 'hsm';
export const DEFAULT_SCREEN: ScreenId = 'visualization';

export const isMill = (v: string): v is MillId => MILLS.some((m) => m.id === v);
export const isScreen = (v: string): v is ScreenId => SCREENS.some((s) => s.id === v);

export const millOf = (id: MillId) => MILLS.find((m) => m.id === id)!;
export const screenOf = (id: ScreenId) => SCREENS.find((s) => s.id === id)!;

export const pathFor = (mill: MillId, screen: ScreenId) => `/${mill}/${screen}`;
