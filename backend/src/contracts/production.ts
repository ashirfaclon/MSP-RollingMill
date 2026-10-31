/** GET /api/hsm/production and /api/hsm/billets — ERP vs the Influx counter, per plant day. */
import type { ByProducts, Grain } from './common';

/** How a counter event piece starts and ends inside a plant day. */
export type CounterEventStart = 'day start' | 'reset' | 'first reading';
export type CounterEventEnd = 'reset' | 'day end' | 'latest reading';

export interface DayValue {
  date: string;
  /** Sum of the day's ERP entries; null when the ERP has none (yet). */
  erpMt: number | null;
  erpEntries: number;
  /** Sum of counter increases in the plant day; null when the counter had no readings. */
  influxMt: number | null;
  /** full = the counter covered the whole plant day; partial = started late or still running. */
  influxCoverage: 'full' | 'partial' | 'none';
  /** The four by-products booked into ERP stores for the day (production only); null if none booked yet. */
  byProducts?: ByProducts | null;
}

export interface PeriodRow {
  key: string;
  label: string;
  fromDate: string;
  toDate: string;
  days: number;
  erpMt: number | null;
  /** Days in the period with an ERP entry. */
  erpDays: number;
  influxMt: number | null;
  /** Days in the period the counter covered fully. */
  influxFullDays: number;
  /** Days with BOTH an ERP entry and a full counter day — the only days variance uses. */
  comparedDays: number;
  /** Σ (Influx − ERP) over compared days. */
  varianceMt: number | null;
  /** varianceMt ÷ Σ ERP over compared days, %. */
  variancePct: number | null;
  /** By-products booked on the days the counter has data (production only); null when none booked yet. */
  byProducts?: ByProducts | null;
  /** Counter days that have by-products booked — fewer than the counter days = ERP not caught up. */
  byProductDays?: number;
  /** Net production = influxMt − all four by-products booked on those days; null when none booked. */
  netMt?: number | null;
}

export interface ProductionComparison {
  from: string;
  to: string;
  grain: Grain;
  dayBoundary: string;
  erp: { connection: 'up' | 'down'; message: string; syncedAt: string | null; lastDate: string | null };
  influx: { connection: 'up' | 'down'; message: string; firstReadingAt: string | null; lastReadingAt: string | null };
  /** The counter's reset events, split at each 08:00 — a day's figure is the total of its events. */
  events: {
    date: string; start: string; end: string;
    startValue: number; endValue: number; value: number; noise: number;
    startedBy: CounterEventStart; endedBy: CounterEventEnd;
  }[];
  /** Counter ticks dropped as noise (no billet behind them) — production only. */
  noise: { applied: boolean; ticks: number; value: number; windowMinutes: number };
  /** Latest date with a by-product booked in ERP stores (production only). */
  byProductsLastDate: string | null;
  days: DayValue[];
  rows: PeriodRow[];
  totals: PeriodRow;
}

/** GET /api/hsm/power — HSM power from the logbook form "Electrical HSM → Power Consumption". */
export interface PowerEntry {
  /** The date the plant entered on the form — used as-is. */
  date: string;
  shift: string;
  equipment: string;
  previousReading: number | null;
  presentReading: number | null;
  /** `power-consumed`, kWh; null when the field is blank or not a number. */
  kwh: number | null;
  /** When the entry was submitted (ISO). */
  enteredAt: string | null;
}

export interface PowerDay {
  date: string;
  /** Σ power-consumed of the day's entries; null when the day has none. */
  kwh: number | null;
  entries: number;
  /** equipment → kWh. */
  byEquipment: Record<string, number>;
  /** Influx production for the plant day (the Production card's Total), MT. */
  productionMt: number | null;
  /** kwh ÷ productionMt. */
  kwhPerMt: number | null;
}

export interface PowerReport {
  from: string;
  to: string;
  form: string;
  logbook: { connection: 'up' | 'down'; message: string; readSince: string | null };
  equipment: string[];
  days: PowerDay[];
  totals: { kwh: number | null; entries: number; byEquipment: Record<string, number>; productionMt: number | null; kwhPerMt: number | null };
  /** Every entry in the range, newest date first. */
  entries: PowerEntry[];
  /**
   * The latest date up to `to` with a power entry (the form's date); null when none in the last six
   * months. The card shows that day when the period has none (the user, 30 Oct 2026).
   */
  lastDate: string | null;
}

/** GET /api/hsm/plan — the rolling plan (targets) per day and shift, as filled in by the plant. */
export interface PlanDay {
  date: string;
  /** Σ target MT for the day; null when the plan has no rows for it. */
  planMt: number | null;
  /** Shift as written in the plan (e.g. "Day", "Night") → target MT. */
  byShift: Record<string, number>;
  /** Influx production for the plant day (the Production card's Total), MT. */
  actualMt: number | null;
  /** That production split by shift (Day 08–20, Night 20–08); null when there is none. */
  actualByShift: Record<string, number> | null;
}

export interface PlanReport {
  from: string;
  to: string;
  /** Where the plan comes from today (a static import of the plant's Excel). */
  source: string;
  days: PlanDay[];
  totals: {
    /** Σ target over the period's planned days; null when none is planned. */
    planMt: number | null;
    byShift: Record<string, number>;
    plannedDays: number;
    days: number;
    /** Production over the same planned days only. */
    actualMt: number | null;
    /** actualMt − planMt: positive = ahead of plan, negative = short (the plant, 17 Oct 2026). */
    gapMt: number | null;
    /** Production per shift over the WHOLE period (planned or not). */
    actualByShift: Record<string, number>;
  };
}
