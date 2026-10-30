/** GET /api/rmd/billets — billets into the RMD mill, per line, from the Influx counters. */
import type { Grain } from './common';

export interface RmdBilletDay {
  date: string;
  /** Billets on line 1 (M1) / line 2 (M2) in the plant day; null when the counter had no reading. */
  m1: number | null;
  m2: number | null;
  /** m1 + m2; null when neither counted. */
  totalPcs: number | null;
}

export interface RmdBilletPeriod extends Omit<RmdBilletDay, 'date'> {
  key: string;
  label: string;
  fromDate: string;
  toDate: string;
  days: number;
}

export interface RmdBilletsReport {
  from: string;
  to: string;
  grain: Grain;
  influx: { connection: 'up' | 'down'; message: string };
  days: RmdBilletDay[];
  rows: RmdBilletPeriod[];
  totals: RmdBilletPeriod;
}

/** GET /api/rmd/live — the mill flow now: billets today and each running-status point. */
export type RmdZoneId = 'route' | 'finishing';

export interface RmdStationNow {
  id: string;
  zone: RmdZoneId;
  line: 1 | 2;
  label: string;
  /** Running (status 1); null when there is no reading in the last 15 min. */
  on: boolean | null;
  /** The drive's current feedback (A), live; null without a fresh reading. */
  currentA: number | null;
  at: string | null;
  fresh: boolean;
}

export interface RmdZoneNow {
  id: RmdZoneId;
  label: string;
  total: number;
  on: number;
  reporting: number;
  state: 'all-on' | 'partial' | 'all-off' | 'no-data';
  stateLabel: string;
}

export interface RmdLive {
  connection: 'up' | 'down';
  message: string;
  now: string;
  /** The RMD day running now (09:00 → 09:00 IST) and its start. */
  plantDay: string;
  plantDayStart: string;
  /** Billets since the RMD day started, M1 + M2 (sum of counter increases). */
  billetsToday: number | null;
  lastReadingAt: string | null;
  fresh: boolean;
  stations: RmdStationNow[];
  zones: RmdZoneNow[];
}

/** GET /api/rmd/stations — each point's running share per interval over the last hours. */
export interface RmdStationTrend {
  connection: 'up' | 'down';
  message: string;
  zone: RmdZoneId;
  from: string;
  to: string;
  bucketSeconds: number;
  /** Per point: [interval start ms, % of the interval running | null]. */
  series: { id: string; line: 1 | 2; label: string; points: [number, number | null][] }[];
}

/** GET /api/rmd/current — each drive's motor current (A) while running, over a period of RMD days. */
export interface RmdCurrentTrend {
  connection: 'up' | 'down';
  message: string;
  zone: RmdZoneId;
  from: string;
  to: string;
  bucketSeconds: number;
  /** Per drive: its mean over the period while running, and [interval start ms, mean A | null (not running)]. */
  series: { id: string; line: 1 | 2; label: string; meanA: number | null; points: [number, number | null][] }[];
}

/** GET /api/rmd/running-rate — production ÷ running hours, per RMD day / week / month. */
export interface RmdRatePeriod {
  key: string;
  label: string;
  fromDate: string;
  toDate: string;
  days: number;
  /** Hours the mill was running: billets (either line) no more than 10 min apart. */
  runH: number | null;
  /** RMD production, MT — the ERP log sheet (PRODUCT_PRIME_SLENGTH_MT); null with no entry. */
  productionMt: number | null;
  /** productionMt ÷ runH; null without both. */
  rateTph: number | null;
}

export interface RmdRunningRateReport {
  from: string;
  to: string;
  grain: Grain;
  gapMinutes: number;
  influx: { connection: 'up' | 'down'; message: string };
  rows: RmdRatePeriod[];
  totals: RmdRatePeriod;
}

/** GET /api/rmd/production — the RMD Production Log Sheet (ERP), per date / week / month. */
export interface RmdProductionPeriod {
  key: string;
  label: string;
  fromDate: string;
  toDate: string;
  days: number;
  /** Days with at least one log-sheet entry. */
  entryDays: number;
  /** ACTUAL_RUNNING_HRS, Σ over the period's entries (the user, 14 Oct 2026); null with no entry. */
  runningHrs: number | null;
  /** PRODUCT_PRIME_SLENGTH_MT (prime + short length), Σ over the period's entries; null with no entry.
   *  The production figure everything else uses. */
  productionMt: number | null;
  /** FINISH_PRODUCT_PRIME_MT (prime only) — the second daily declaration, shown beside it. */
  primeMt: number | null;
  burningLossMt: number | null;
  endCutMt: number | null;
  missRollMt: number | null;
  /** CHIP_OFF_MT — the plant's rejection. */
  chipOffMt: number | null;
  /** burning loss + end cut + miss roll + chip off. */
  lossesMt: number | null;
  /** INPUT_MT — billet input, Σ over the period's entries; null with no entry. */
  billetInputMt: number | null;
  /** billetInputMt − productionMt; null without both. */
  massDiffMt: number | null;
  /** productionMt ÷ billetInputMt × 100; null without both. */
  massYieldPct: number | null;
}

export interface RmdProductionReport {
  from: string;
  to: string;
  grain: Grain;
  erp: { connection: 'up' | 'down'; message: string; syncedAt: string | null; lastDate: string | null };
  rows: RmdProductionPeriod[];
  totals: RmdProductionPeriod;
}

/** GET /api/rmd/stock — finished stock by bar size in FGYRDP at the end of a date (ERP item ledger), every SKU of the plant's list. */
export interface RmdStockReport {
  asOf: string;
  erp: { connection: 'up' | 'down'; message: string; syncedAt: string | null; lastDate: string | null };
  /** One row per bar size, smallest first, then 'Other' (the plant's items with no bar size). Every
   *  item of the plant's list in stock is in exactly one row (largest first); items and rows at 0 are left out. */
  sizes: { key: string; label: string; sizeMm: number | null; stockMt: number; items: { code: string; name: string; stockMt: number }[] }[];
  totalMt: number;
}

/** GET /api/rmd/plan — the month-wise plan spread to days and shifts, against ERP Prime + SL. */
export interface RmdPlanDay {
  date: string;
  /** Plan for the day, MT (Prime + SL); null when the plan has no month for it. */
  planMt: number | null;
  /** Day / Night → half the day's plan each. */
  byShift: Record<string, number>;
  /** ERP Prime + SL (PRODUCT_PRIME_SLENGTH_MT) for the date; null until it is entered. */
  actualMt: number | null;
  /**
   * LSM only: the date's ERP production split between the shifts by their prime pieces (logbook
   * LSM Production Sheet); null for both when the ERP or the form has nothing for the date.
   */
  actualByShift?: Record<string, number | null>;
}

export interface RmdPlanReport {
  from: string;
  to: string;
  source: string;
  days: RmdPlanDay[];
  totals: {
    /** Σ plan over the period's planned days; null when none is planned. */
    planMt: number | null;
    /** Σ plan per shift over the planned days. */
    byShift: Record<string, number | null>;
    plannedDays: number;
    days: number;
    /** Planned days that also have ERP production — the days plan gap and compliance compare. */
    comparedDays: number;
    comparedPlanMt: number | null;
    /** ERP Prime + SL over the compared days. */
    actualMt: number | null;
    /** actualMt − comparedPlanMt: positive = ahead of plan, negative = short (the plant, 17 Oct 2026). */
    gapMt: number | null;
    /** actualMt ÷ comparedPlanMt × 100. */
    compliancePct: number | null;
    /** LSM only, per shift, over the days that have a split: output, the plan of those days, compliance. */
    shifts?: Record<string, { actualMt: number | null; comparedPlanMt: number | null; compliancePct: number | null }>;
  };
  /** LSM only: the logbook form the shift split comes from. */
  shiftSource?: { form: string; connection: 'up' | 'down'; message: string };
}

/** GET /api/rmd/asset-forms — the logbook's Mill Bearing Temperature and Oil Tank forms (tmt-mechanical). */
export interface RmdReading {
  /** e.g. "20\" R stand", "OC stand 3", "NC stand 1–2". */
  equipment: string;
  /** e.g. "Pinion gear D side", "Level", "Temperature". */
  point: string;
  value: number;
  /** The entry's Date: the day the readings are for (YYYY-MM-DD). */
  at: string;
  /** The plant's limits for this reading (°C); null where none is given (oil level). */
  min: number | null;
  max: number | null;
  /** Inside the limits, below or above them; null without limits. */
  status: 'ok' | 'low' | 'high' | null;
  /** Oil tank level only: the oil in the tank, L (level × inside length × width), and the tank's capacity, L. */
  litres?: number;
  capacityL?: number;
}

export interface RmdBearingGroup {
  /** Every bearing at its form's latest entry in the period. */
  latest: RmdReading[];
  /** The hottest of those. */
  max: RmdReading | null;
  /** The hottest bearing of each entry, oldest first (by Date, then when filled); at = the Date. */
  trend: { at: string; equipment: string; maxC: number }[];
  entries: number;
  /**
   * The latest Date up to `to` with a bearing reading of the group; null when none in the last six
   * months. The card shows that day when the period has none (the user, 30 Oct 2026).
   */
  lastDate: string | null;
}

export interface RmdOilGroup {
  /** Each tank's level at the latest Oil Tank Level entry in the period: value in inches, with litres and capacity. */
  level: RmdReading[];
  /** Each tank's temperature (°C) at the latest Oil Tank Temperature entry. */
  temperature: RmdReading[];
  /** The tank lowest against its capacity (litres ÷ capacity). */
  minLevel: RmdReading | null;
  /**
   * The latest Date up to `to` with a level / a temperature of one of the group's tanks; null when
   * none in the last six months. The card shows that day when the period has none (the user, 30 Oct 2026).
   */
  levelLastDate: string | null;
  temperatureLastDate: string | null;
}

export interface RmdAssetForms {
  from: string;
  to: string;
  logbook: { connection: 'up' | 'down'; message: string };
  bearing: { roughing: RmdBearingGroup; route: RmdBearingGroup };
  oil: { roughing: RmdOilGroup; route: RmdOilGroup };
}

/** GET /api/rmd/condition — Condition Analytics mimic: each drive's current and speed while running, over a period. */
export interface RmdConditionDrive {
  id: string;
  line: 1 | 2;
  label: string;
  /** Mean current (A) / speed (RPM) while running (its running status 1); null when it never ran. */
  meanA: number | null;
  meanRpm: number | null;
}
export interface RmdConditionGroup {
  drives: RmdConditionDrive[];
  /** Drives that ran in the period. */
  ran: number;
  /** Mean current of the drives that ran (each drive weighs the same), A. */
  meanA: number | null;
  /** Mean speed of the drives that ran, per line (the lines read on different scales), RPM. */
  meanRpmByLine: Record<string, number | null>;
}
export interface RmdConditionReport {
  from: string;
  to: string;
  historian: { connection: 'up' | 'down'; message: string };
  /** CR Mill1/2 · M1 S1–S8, M2 S1–S6. */
  stands: RmdConditionGroup;
  finishing: RmdConditionGroup;
}

/** One trend bucket of the mill speeds: the mean reading of each mill, m/s. */
export interface RmdMillSpeedPoint {
  t: string;
  mill1: number | null;
  mill2: number | null;
}

/** Mill MPS (CR Mill1/2 · General · MILL1_MPS, MILL2_MPS), m/s, over a period of RMD days. */
export interface RmdMillSpeedReport {
  from: string;
  to: string;
  historian: { connection: 'up' | 'down'; message: string };
  /** The last reading of the period (now, for a period that includes today). */
  latest: { mill1: number | null; mill2: number | null; at: string | null };
  trend: RmdMillSpeedPoint[];
  bucketMinutes: number;
}

/** One CCM lollipop sample from the SMS form, for RMD. */
export interface RmdChemSample {
  date: string;
  time: string | null;
  furnace: string;
  ccm: string;
  section: string;
  /** % C, Mn, S, P, Si. */
  c: number | null;
  mn: number | null;
  s: number | null;
  p: number | null;
  si: number | null;
}

/** Chemical composition: SMS → CCM Lolipop Sample, entries for RMD in the period. */
export interface RmdChemistryReport {
  from: string;
  to: string;
  form: string;
  logbook: { connection: 'up' | 'down'; message: string };
  /** The latest sample of the period. */
  latest: RmdChemSample | null;
  /** Every sample of the period, newest first. */
  samples: RmdChemSample[];
  /**
   * The latest date up to `to` with an RMD sample analysed (any of C, Mn, S, P, Si) (the form's Date); null when none in the last six
   * months. The card shows that day when the period has none (the user, 30 Oct 2026).
   */
  lastDate: string | null;
}
