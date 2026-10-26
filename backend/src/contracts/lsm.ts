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
  /** NET_RUNNING_HRS — ERP run hours, Σ over the period's entries; null with none filled. */
  runningHrs: number | null;
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
  /** Σ (INPUT_MT1 + INPUT_MT2) — billet input, MT; null with none filled. */
  billetInputMt: number | null;
  /** billetInputMt − productionMt. */
  massDiffMt: number | null;
  /** productionMt ÷ billetInputMt × 100. */
  massYieldPct: number | null;
  /** The losses that make up the mass difference, MT (…_MT1 + …_MT2 where split). */
  burningLossMt: number | null;
  endCutMt: number | null;
  missRollMt: number | null;
  coldMt: number | null;
  rejectMt: number | null;
  /** NET_RUNNING_HRS — ERP run hours, Σ over the period's entries; null with none filled. */
  runningHrs: number | null;
  /** Σ of the five; null when none is filled. */
  lossesMt: number | null;
}

export interface RmsProductionReport {
  from: string;
  to: string;
  grain: Grain;
  erp: { connection: 'up' | 'down'; message: string; syncedAt: string | null; lastDate: string | null };
  rows: RmsProductionPeriod[];
  totals: RmsProductionPeriod;
}

/**
 * GET /api/lsm/plan — the same shape as RMD's plan: the plan per day and shift against ERP
 * production (here PRODUTION_MT, the LSM Production card's figure).
 */
export type LsmPlanReport = import('./rmd').RmdPlanReport;

/**
 * GET /api/lsm/running-rate, /api/rms/running-rate — ERP production ÷ running hours calculated
 * from the mill's Production Sheet form (each run's start → end, overlaps merged), per period.
 */
export interface FormRunningRateReport {
  from: string;
  to: string;
  grain: Grain;
  /** The logbook form the running hours come from. */
  form: string;
  logbook: { connection: 'up' | 'down'; message: string };
  rows: import('./rmd').RmdRatePeriod[];
  totals: import('./rmd').RmdRatePeriod;
}

/** One reading of LSM Mechanical → Drive Temp: a drive's bearing temperatures and gearbox oil. */
export interface LsmDriveReading {
  /** The LSM mill day (09:00 → 09:00 IST) of the form's date-time. */
  date: string;
  /** The form's date-time, as filled. */
  at: string;
  shift: string;
  drive: string;
  /** Bearing temperatures, °C. */
  flywheelDeC: number | null;
  flywheelNdeC: number | null;
  reductionDeC: number | null;
  reductionNdeC: number | null;
  pinionDeC: number | null;
  pinionNdeC: number | null;
  /** Gearbox oil pressure, kg/cm². */
  oilPressure: number | null;
  /** Gearbox oil level, inches. */
  oilLevelIn: number | null;
}

/** LSM Asset Health: the Drive Temp form over a period. */
export interface LsmDriveReport {
  from: string;
  to: string;
  form: string;
  logbook: { connection: 'up' | 'down'; message: string };
  /** Each drive's latest reading of the period. */
  latest: LsmDriveReading[];
  /** Every reading of the period, oldest first. */
  entries: LsmDriveReading[];
}

/** One pass of an LSM Mill Load Log Sheet reading: the stand, the pass and its load, A. */
export interface LsmPassLoad {
  stand: number;
  pass: number;
  loadA: number | null;
}

/** One entry of LSM Electrical Logbook → Mill Load Log Sheet: every stand's load at one time. */
export interface LsmMillLoadReading {
  /** The form's date ("date-and-time" holds the date). */
  date: string;
  /** The form's time, as filled. */
  time: string | null;
  section: string;
  billetSize: string;
  passes: LsmPassLoad[];
  /** Mean load of the passes filled, A; null with none. */
  meanA: number | null;
}

/** LSM Asset Health: the Mill Load Log Sheet over a period. */
export interface LsmMillLoadReport {
  from: string;
  to: string;
  form: string;
  logbook: { connection: 'up' | 'down'; message: string };
  /** The latest reading of the period. */
  latest: LsmMillLoadReading | null;
  /** Every reading of the period, oldest first. */
  entries: LsmMillLoadReading[];
}
