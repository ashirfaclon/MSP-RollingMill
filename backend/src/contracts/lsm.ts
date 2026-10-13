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
  /** burning loss + end cut + miss roll + cold + reject. */
  lossesMt: number | null;
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
