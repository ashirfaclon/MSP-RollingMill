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
