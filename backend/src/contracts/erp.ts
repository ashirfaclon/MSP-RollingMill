/** GET /api/hsm/logsheet, /sizes, /orders, /stock — computed from the ERP cache. */
import type { ErpMeta, Grain } from './common';

/** Log-sheet sums for one day or one period. MT/pcs values are null when no day in it has an entry. */
export interface LogPeriod {
  key: string;
  label: string;
  fromDate: string;
  toDate: string;
  days: number;
  /** Days with at least one log-sheet voucher. */
  entryDays: number;
  entries: number;
  inputMt: number | null;
  inputPcs: number | null;
  productionMt: number | null;
  productionPcs: number | null;
  primeMt: number | null;
  defectiveMt: number | null;
  rollingDefectMt: number | null;
  burningLossMt: number | null;
  endCutMt: number | null;
  missRollMt: number | null;
  rejectMt: number | null;
  /** input − production. */
  massDiffMt: number | null;
  /** Σ production ÷ Σ input × 100. */
  yieldPct: number | null;
  /** Finished strip received into stores (PROD_TRAN F-items). */
  storesMt: number | null;
  /** input − (production + the four losses); 0 when the log sheet balances. */
  balanceGapMt: number | null;
  /** production − (prime + defective + rolling defect). */
  qualityGapMt: number | null;
  /** production − stores receipts. */
  storesGapMt: number | null;
  /** Entry days on which each check held within CHECK_TOLERANCE_MT. */
  balanceOkDays: number;
  qualityOkDays: number;
  storesOkDays: number;
}

export interface LogSheetReport {
  from: string;
  to: string;
  grain: Grain;
  erp: ErpMeta;
  rows: LogPeriod[];
  totals: LogPeriod;
}

export interface SizeRow {
  key: string;
  label: string;
  width: string;
  thickness: number | null;
  defective: boolean;
  producedMt: number;
  dispatchedMt: number;
  /** Dispatched on a sale line that names its sales order. */
  dispatchedWithOrderMt: number;
  /** ERP item codes merged into this size ("Direct" and plain variants of one spec). */
  items: { code: string; name: string }[];
}

export interface SizeReport {
  from: string;
  to: string;
  erp: ErpMeta;
  rows: SizeRow[];
  totals: { producedMt: number; dispatchedMt: number; dispatchedWithOrderMt: number };
  /** Non-strip receipts (end cuts, miss-roll strip, mill scale) — shown, not mixed into sizes. */
  byProducts: { code: string; name: string; mt: number }[];
}

export interface OrderPeriod {
  key: string;
  label: string;
  fromDate: string;
  toDate: string;
  lines: number;
  orderedMt: number;
  executedMt: number;
  cancelledMt: number;
  pendingMt: number;
}

export interface OpenLine {
  orderNo: string;
  line: number;
  date: string;
  client: string;
  size: string;
  qtyMt: number;
  executedMt: number;
  pendingMt: number;
  ageDays: number;
  due: string | null;
  overdue: boolean;
}

export interface OrdersReport {
  from: string;
  to: string;
  grain: Grain;
  /** Plant date the open book and ages are counted at. */
  asOf: string;
  erp: ErpMeta;
  /** Orders PLACED in the range, per period of their order date. */
  rows: OrderPeriod[];
  totals: OrderPeriod;
  /** Every line still open in the ERP today, whatever its order date. */
  open: {
    lines: number;
    pendingMt: number;
    overdueLines: number;
    overdueMt: number;
    ages: { label: string; lines: number; pendingMt: number }[];
    byClient: { client: string; lines: number; pendingMt: number }[];
    list: OpenLine[];
  };
}

export interface StockSize {
  item: string;
  label: string;
  defective: boolean;
  openingMt: number;
  inMt: number;
  outMt: number;
  stockMt: number;
}

export interface StockReport {
  /** Plant date the stock is counted to (inclusive). */
  asOf: string;
  erp: ErpMeta;
  /**
   * Where the count starts. `opening`: the ERP's opening stock for the financial year of
   * `asOf`, plus movements since 1 April. `ledger-start`: that opening is not in the ERP
   * yet, so the count starts at 0 on the ERP go-live date — the figure is the change since
   * then, and switches to the true stock by itself once the opening is entered.
   */
  basis: { kind: 'opening' | 'ledger-start'; year: string; from: string };
  totals: { openingMt: number; inMt: number; outMt: number; stockMt: number };
  byType: { type: string; label: string; inMt: number; outMt: number }[];
  sizes: StockSize[];
  /** Sizes below zero — more dispatched than received since `basis.from`. */
  negative: { sizes: number; mt: number };
  /** Stock level at the end of each day, `basis.from` → `asOf`. */
  daily: { date: string; inMt: number; outMt: number; stockMt: number }[];
}
