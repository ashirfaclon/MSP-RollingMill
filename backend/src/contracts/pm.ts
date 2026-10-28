/** GET /api/pm/:mill — ERP PM for an Asset Health screen (EQPT_* tables), whole mill. */

/** One breakdown: plant-local times, hours down. */
export interface PmBreakdown {
  vrno: string;
  equipment: string;
  from: string;
  to: string;
  hours: number | null;
  remark: string | null;
  closed: boolean;
}

/** PM falling due in one month of the period (up to `asOf`). */
export interface PmMonth {
  month: string;
  due: number;
  doneOnTime: number;
  doneLate: number;
  open: number;
}

export interface PmReport {
  mill: string;
  from: string;
  to: string;
  erp: { connection: 'up' | 'down'; message: string; syncedAt: string | null };
  /** The mill's equipment in the ERP PM module; 0 = not in it, so every figure is NA. */
  equipment: number;
  /** PM falling due from `from` to `asOf`: the period end, or yesterday when the period reaches today. */
  pm: { asOf: string; due: number; done: number; doneOnTime: number; onTimePct: number | null };
  months: PmMonth[];
  /** The first date from today with PM not yet done, and how many fall due that day. */
  nextPm: { date: string; count: number } | null;
  /** Breakdowns starting in the period, test entries left out. */
  breakdowns: PmBreakdown[];
  breakdownHours: number | null;
  /** Breakdown hours ÷ breakdowns; null with none. */
  mttrH: number | null;
  /** Work orders raised up to `to` and neither closed nor cancelled. */
  openWorkOrders: number;
  /** Open corrective work: breakdowns reported up to `to` and not closed, test entries left out. */
  openActions: number;
}
