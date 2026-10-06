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
  /** The counter's reset events, split at each 06:00 — a day's figure is the total of its events. */
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
