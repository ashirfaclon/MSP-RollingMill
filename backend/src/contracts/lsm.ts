/** GET /api/lsm/production — the LSM Production Log Sheet (ERP, FA-LP-P), per date / week / month. */
import type { Grain } from './common';

export interface LsmProductionPeriod {
  key: string;
  label: string;
  fromDate: string;
  toDate: string;
  days: number;
  /** Days with at least one log-sheet entry. */
  entryDays: number;
  /** PRODUTION_MT, Σ over the period's entries; null with no entry. */
  productionMt: number | null;
  burningLossMt: number | null;
  endCutMt: number | null;
  missRollMt: number | null;
  coldMt: number | null;
  rejectMt: number | null;
  /** SHORTLENGTH_MT. */
  shortLengthMt: number | null;
  /** burning loss + end cut + miss roll + cold + reject + short length (= billet input − production). */
  lossesMt: number | null;
  /** INPUT_PCS — billets in, pieces, Σ over the period's entries; null with no entry. */
  billetsPcs: number | null;
  /** INPUT_MT — billet input, Σ over the period's entries; null with no entry. */
  billetInputMt: number | null;
  /** billetInputMt − productionMt; null without both. */
  massDiffMt: number | null;
  /** productionMt ÷ billetInputMt × 100; null without both. */
  massYieldPct: number | null;
  lsmBypassMt: number | null;
  ccmBypassMt: number | null;
  endCrackBypassMt: number | null;
}

export interface LsmProductionReport {
  from: string;
  to: string;
  grain: Grain;
  erp: { connection: 'up' | 'down'; message: string; syncedAt: string | null; lastDate: string | null };
  rows: LsmProductionPeriod[];
  totals: LsmProductionPeriod;
}

/** GET /api/lsm/stock — finished stock by section at the end of a date (the plant's stock rule, division LS). */
export interface LsmStockReport {
  asOf: string;
  erp: { connection: 'up' | 'down'; message: string; syncedAt: string | null; lastDate: string | null };
  /** One row per section of every finished item under LS: the plant's 19 first (A 65×65×8, MC 75×40,
   *  MB 125×70 …) in their order, then the rest (A 40×40×5, MC 150, Round 32 …), Other last;
   *  every item in stock listed (largest first). Items and sections at 0 are left out. */
  sizes: { key: string; label: string; stockMt: number; items: { code: string; name: string; stockMt: number }[] }[];
  totalMt: number;
}

/** GET /api/rms/stock — the same shape, division RS. */
export type RmsStockReport = LsmStockReport;

/** GET /api/rms/production — the RMS Production Log Sheet (ERP, division RS), per date / week / month. */
export interface RmsProductionPeriod {
  key: string;
  label: string;
  fromDate: string;
  toDate: string;
  days: number;
  entryDays: number;
  /** Entries counted (a repeated identical entry counts once). */
  entries: number;
  /** Σ PRODUCTION_MT; null with no entry. */
  productionMt: number | null;
  /** Σ INPUT_PCS — billets in, pieces; null with no entry. */
  billetsPcs: number | null;
}

export interface RmsProductionReport {
  from: string;
  to: string;
  grain: Grain;
  erp: { connection: 'up' | 'down'; message: string; syncedAt: string | null; lastDate: string | null };
  rows: RmsProductionPeriod[];
  totals: RmsProductionPeriod;
}
