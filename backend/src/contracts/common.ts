/**
 * Types shared across the API's responses. Type-only — no runtime code, no imports — so the
 * frontend can import the whole contract without pulling in any backend dependency.
 */

export type Grain = 'day' | 'week' | 'month';

export interface ErpMeta {
  connection: 'up' | 'down';
  message: string;
  syncedAt: string | null;
  /** Latest date the source has an entry for. */
  lastDate: string | null;
}

/** The four by-products of rolling, as booked into ERP stores. */
export type ByProductKey = 'millScale' | 'stripEndcut' | 'missRoll' | 'finishEndcut';
export type ByProducts = Record<ByProductKey, number>;

/** HSM stand groups (the historian has no intermediate group). */
export type StandGroup = 'roughing' | 'finishing';
