/** GET /api/settings/:mill — every limit of a mill in use, with its default and where it came from. */

/** plant / placeholder: the shipped default (config/limits.ts); edited: saved from the Settings screen; none: no limit. */
export type LimitSource = 'plant' | 'placeholder' | 'edited' | 'none';

export interface LimitSetting {
  id: string;
  group: 'Temperatures' | 'Oil' | 'Motors' | 'Vibration' | 'Chemistry' | 'Daily production';
  label: string;
  unit: string;
  /** Where the reading it judges comes from. */
  reading: string;
  /** The limit in use: below `min` or above `max` is outside; null = no limit on that side. */
  min: number | null;
  max: number | null;
  /** The shipped default and where it came from. */
  defaults: { min: number | null; max: number | null; approval: 'plant' | 'placeholder' | 'none'; basis: string };
  source: LimitSource;
  /** Who saved the edit and when (edited only). */
  setBy: string | null;
  setAt: string | null;
  /**
   * Past these a reading outside the limit is critical, not a warning (§4: a breach deeper than one
   * band width; a one-sided limit's width is 15 % of the limit). Null on a side with no limit.
   */
  critical: { below: number | null; above: number | null };
  /** What an edit may be. */
  range: [number, number];
  dp: number;
}

export interface MillSettings {
  mill: 'hsm' | 'rmd' | 'lsm' | 'rms';
  limits: LimitSetting[];
  /** The shared settings store (IOsense): down = the defaults are in use, and saving is not possible. */
  store: { connection: 'up' | 'down'; message: string; updatedAt: string | null; updatedBy: string | null };
}

/**
 * POST /api/settings/:mill — only what changed. A limit set to { min, max } is saved (one side may
 * be null, not both); a limit set to null goes back to its default.
 */
export interface SettingsSaveBody {
  /** The name typed in the Settings screen, shown as "Set by …". */
  by?: string;
  limits: Record<string, { min: number | null; max: number | null } | null>;
}

export interface SettingsSaveResult {
  ok: true;
  /** Limits changed by this save. */
  changed: number;
  updatedAt: string;
}
