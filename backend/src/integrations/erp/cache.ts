/**
 * ERP cache reader. The API NEVER opens Oracle: `npm run sync:erp` (erp/sync.ts) pulls raw
 * rows read-only into JSON files under `data/`, and this module only reads those files.
 * A page load can therefore never load the production ERP, and a missing Instant Client
 * can never take the app down (handover §4).
 *
 * Reads are mtime-gated: the file is re-parsed only when a sync rewrites it. A missing
 * cache is a STATED state ("not synced yet"), never a crash.
 */
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Env } from '../../config/env';
import { MSG } from '../../shared/messages';
import type { ErpDivisionRow, ErpMill, ErpSyncAttempt, ErpStatus } from '../../contracts';
export type { ErpDivisionRow, ErpMill, ErpSyncAttempt, ErpStatus };

/**
 * Entities this app may read. MP = MSP Steel & Power, MS = MSP Sponge Iron (Raigarh).
 * MK is a different plant and is never read.
 */
export const ERP_ENTITIES = ['MP', 'MS'] as const;

export interface ErpCache {
  syncedAt: string;
  /** ERP server clock at sync time — proves the round trip, and catches clock skew. */
  serverTime: string;
  source: string;
  divisions: ErpDivisionRow[];
}

export const cachePaths = (env: Env) => {
  const dir = path.resolve(process.cwd(), env.erpCacheDir);
  return {
    dir,
    cache: path.join(dir, 'erp-hsm.json'),
    attempt: path.join(dir, 'erp-hsm-sync.json'),
    production: path.join(dir, 'erp-hsm-production.json'),
    commercial: path.join(dir, 'erp-hsm-commercial.json'),
    rmdProduction: path.join(dir, 'erp-rmd-production.json'),
    rmdStock: path.join(dir, 'erp-rmd-stock.json'),
    lsmProduction: path.join(dir, 'erp-lsm-production.json'),
    lsmStock: path.join(dir, 'erp-lsm-stock.json'),
    rmsStock: path.join(dir, 'erp-rms-stock.json'),
    rmsProduction: path.join(dir, 'erp-rms-production.json'),
    /** ERP PM, one file per mill (the user, 25 Nov 2026: a mill's data in its own files, ready for per-mill access). */
    pm: Object.fromEntries(PM_MILLS.map((m) => [m, path.join(dir, `erp-pm-${m}.json`)])) as Record<PmMill, string>,
    /** The one-file PM cache synced before 25 Nov 2026 — read only until the first per-mill sync. */
    pmLegacy: path.join(dir, 'erp-pm.json'),
  };
};

/**
 * ERP PM (the plant, 28 Oct 2026): equipment EQPT_ID_MAST, PM schedule EQPT_JOB_LIST_MAST /
 * EQPT_PM_TRAN, work orders and breakdowns EQPT_PM_LOG / EQPT_PM_TRAN. A mill is its equipment's
 * division: HSM S1, RMD RM, LSM LS, RMS RS.
 */
export const PM_DIVISIONS = { hsm: 'S1', rmd: 'RM', lsm: 'LS', rms: 'RS' } as const;
export type PmMill = keyof typeof PM_DIVISIONS;
const PM_MILLS = Object.keys(PM_DIVISIONS) as PmMill[];
/** PM reminders falling due on one date: how many, done, and done by the due date. */
export interface ErpPmDay { date: string; due: number; done: number; doneOnTime: number }
/** One breakdown (EQPT_PM_LOG, TNATURE = 'BKDN'): plant-local times, hours down. */
export interface ErpPmBreakdown {
  vrno: string; equipment: string; from: string; to: string; hours: number | null;
  remark: string | null; closed: boolean;
}
/** One work order (EQPT_PM_TRAN, TNATURE = 'WOPM'). */
export interface ErpPmWorkOrder { vrno: string; date: string; equipment: string; closed: boolean; cancelled: boolean }
/** One mill's ERP PM (erp-pm-<mill>.json). */
export interface ErpPmCache {
  mill: PmMill;
  syncedAt: string;
  source: string;
  /** Equipment in EQPT_ID_MAST (0: the mill is not in the ERP's PM module). */
  equipment: number;
  days: ErpPmDay[];
  breakdowns: ErpPmBreakdown[];
  workOrders: ErpPmWorkOrder[];
}
/** The one-file shape synced before 25 Nov 2026: every mill's rows together, each row tagged. */
interface ErpPmLegacyCache {
  syncedAt: string;
  source: string;
  equipment: Record<PmMill, number>;
  days: (ErpPmDay & { mill: PmMill })[];
  breakdowns: (ErpPmBreakdown & { mill: PmMill })[];
  workOrders: (ErpPmWorkOrder & { mill: PmMill })[];
}

const untag = <T extends { mill: PmMill }>(rows: T[], mill: PmMill) =>
  rows.filter((r) => r.mill === mill).map(({ mill: _, ...r }) => r);

/** One mill's ERP PM; until the first per-mill sync, its rows of the old one-file cache. */
export function readErpPm(env: Env, mill: PmMill): ErpPmCache | null {
  const p = cachePaths(env);
  const own = readJson<ErpPmCache>(p.pm[mill]);
  if (own) return own;
  const old = readJson<ErpPmLegacyCache>(p.pmLegacy);
  return old && {
    mill, syncedAt: old.syncedAt, source: old.source, equipment: old.equipment[mill] ?? 0,
    days: untag(old.days, mill), breakdowns: untag(old.breakdowns, mill), workOrders: untag(old.workOrders, mill),
  };
}

/**
 * RMD log-sheet codes, exactly as the plant gave them (RMD - ERP Data Filled.xlsx, 10 Oct
 * 2026): table ATTR_TRAN_DATA_BODY, USER_CODE = 'FA-SKJ', ATTR_CODE → ATTR_VALUE, dated by
 * VRDATE. Two spellings differ from the sheet (MISSROLL_MT → MISROLL_MT, CHIP_OFF →
 * CHIP_OFF_MT): the sheet's spelling returned no rows; these are the codes in the table,
 * confirmed with the user. Chip off is the plant's rejection. MILL_SINGLE_STAND: single-stand running
 * time for TPH (the plant, 13 Nov 2026) — entered in minutes, already inside ACTUAL_RUNNING_HRS
 * (every entry Jun–Nov 2026: 5–50, on days running hours equal the scheduled hours).
 */
/**
 * The Zoho TMT KPIs the plant asked for (21 Nov 2026: "Rolling on Casting, Delivery and Efficiency"),
 * as the ERP log sheet holds them per entry — the ERP is the source of truth, Zoho's figures only a
 * reference (the plant). Rolling in Casting % = ROLLING_IN_TOTAL_PERCENTAGE, the only casting-related
 * percentage; PLANT_EFFICIENCY = PLANT_PERFORMANCE (production ÷ PRODUCTION_TARGET × 100) × PLANT_AVAILABILITY
 * ÷ 100 — on 620 of 621 entries (30 Nov 2025 – 24 Nov 2026); production ÷ target alone only where availability
 * is 100 %, i.e. no breakdown. PRODUCTION_TARGET weights efficiency over a period — the plan is typed on the
 * dashboard (the plant).
 */
export const RMD_ROLLING_FIELDS = ['ROLLING_IN_TOTAL_PERCENTAGE', 'ROLLING_IN_DELIVERY_PRCNT', 'PLANT_EFFICIENCY', 'PRODUCTION_TARGET'] as const;
/**
 * Coal, Offline (RO002) entries only — Online ones hold 0 (the user, 24 Nov 2026). COAL_CONSUMPTION_KGMT =
 * TOTAL_COAL_CONSUMPTION (MT) × 1000 ÷ PRODUCT_PRIME_SLENGTH_MT on every Offline entry checked (58, Sep–Nov 2026).
 */
export const RMD_COAL_FIELDS = ['COAL_CONSUMPTION_KGMT', 'TOTAL_COAL_CONSUMPTION'] as const;
/**
 * Breakdown, the plant's sheet (the user, 25 Nov 2026): the seven below added, every one in minutes. The ERP's own
 * MILL_TOTAL_BREAKDOWN_HRS adds the first five only; the sheet also counts the single stand and mill 1½ — the user
 * chose the sheet. In practice only Online entries have any (Nov 2025 – Nov 2026).
 */
export const RMD_BREAKDOWN_FIELDS = [
  ['MILL_BKDN_IN_MIN_MECHANICAL', 'Mechanical'],
  ['MILL_BKDN_IN_MIN_ELECTRICAL', 'Electrical'],
  ['MILL_BKDN_IN_MIN_PROCESS', 'Process'],
  ['MILL_BKDN_IN_MIN_RM', 'Raw material'],
  ['MILL_BKDN_IN_MIN_POWEROTHERS', 'Power / other'],
  ['MILL_SINGLE_STAND', 'Mill single stand'],
  ['MILL_1_12__STAND', 'Mill 1½'],
] as const;
/**
 * The balance strip's bypasses and short length (the user, 25 Nov 2026, the plant's sheet): CCM_BYPASS_MT (Online and
 * Both), MILL_BYPASS_MT — the RMD bypass — and FINISH_PRODUCT_SLENGTH_MT (short length; Prime + SL = Prime + it on
 * 578 of 621 entries). SHORTLENGTH_CUT is 0 on every entry and is not read.
 */
export const RMD_BALANCE_FIELDS = ['CCM_BYPASS_MT', 'MILL_BYPASS_MT', 'FINISH_PRODUCT_SLENGTH_MT'] as const;
/** TPH, the plant's sheet (the user, 25 Nov 2026): the ERP's delivery rate, MT per hour, per entry. */
export const RMD_RATE_FIELDS = ['DELIVERY_RATE_MTHRS'] as const;
/**
 * CCM breakdown, hours (the user, 26 Nov 2026): TOTAL_CCM_BD_IN_HRS — the caster's stops, Online only. In the log sheet
 * SCHEDULE_HRS − it = AVAILABLE_HOURS (301 of 301 entries with one), and AVAILABLE_HOURS − the five mill categories =
 * ACTUAL_RUNNING_HRS (155 of 164): running hours already exclude both.
 */
export const RMD_CCM_FIELDS = ['TOTAL_CCM_BD_IN_HRS'] as const;
export const RMD_LOG_FIELDS = ['INPUT_MT', 'ACTUAL_RUNNING_HRS', 'PRODUCT_PRIME_SLENGTH_MT', 'FINISH_PRODUCT_PRIME_MT', 'BLOSS_MT', 'ENDCUT_MT', 'MISROLL_MT', 'CHIP_OFF_MT', 'TOTAL_POWER_CONSUMPTION',
  ...RMD_BALANCE_FIELDS, ...RMD_RATE_FIELDS, ...RMD_CCM_FIELDS, ...RMD_ROLLING_FIELDS, ...RMD_COAL_FIELDS, ...RMD_BREAKDOWN_FIELDS.map(([f]) => f)] as const;
export type RmdLogField = (typeof RMD_LOG_FIELDS)[number];
/**
 * Online / Offline: the log sheet head's TRAN_COLUMN_NAME1, RO001 = Online, RO002 = Offline (Management
 * Dash.xlsx, 12 Nov 2026). Power per rolling is the entry's TOTAL_POWER_CONSUMPTION, kWh (the user,
 * 13 Nov 2026) — on Zoho's Online / Offline power, POWER_KWHMT = it ÷ PRODUCT_PRIME_SLENGTH_MT.
 */
export const RMD_MODE_CODES = { RO001: 'online', RO002: 'offline' } as const;
export type RmdLogMode = (typeof RMD_MODE_CODES)[keyof typeof RMD_MODE_CODES];
/** `mode` is missing on a cache synced before the Online / Offline split; a value absent there reads as null. */
export interface RmdLogRow { date: string; vrno: string; mode?: RmdLogMode | null; v: Record<RmdLogField, number | null> }
export interface RmdProductionCache { syncedAt: string; source: string; fromDate: string; rows: RmdLogRow[]; receipts?: MillReceipt[] }

export function readErpRmdProduction(env: Env): RmdProductionCache | null {
  return readJson<RmdProductionCache>(cachePaths(env).rmdProduction);
}

/**
 * The plant's stock rule (their stock-balance query, 12 Oct 2026): ITEMTRAN_BODY, every entry
 * since the ledger starts, without these voucher types (TCODE) — stock = Σ QTYRECD − Σ QTYISSUED.
 */
export const STOCK_EXCLUDED_TCODES = ['MC', 'FS', 'ME', 'NG', 'NP', 'QJ', 'ZH', 'ZP', 'ZW', 'ZF', 'MR', 'ZM', 'ES', 'NT', 'ZS', 'ZA', 'MD', 'NI', 'Z8'] as const;
/** Divisions the plant's stock query covers. */
export const STOCK_DIVISIONS = ['RM', 'RS', 'LS', 'PL', 'SI', 'SM', 'S1'] as const;

/**
 * LSM log-sheet codes, as the plant gave them (lsm ERP DATA (1).xlsx, 13 Oct 2026): table
 * ATTR_TRAN_DATA_BODY, USER_CODE = 'FA-LP-P' (every entry is division LS), ATTR_CODE →
 * ATTR_VALUE, dated by VRDATE. Production: the sheet says PRODUCTION_MT, which the table does
 * not have; it is spelt PRODUTION_MT there (confirmed with the user). Billet input: INPUT_MT
 * (the user, 13 Oct 2026); billets in, pieces: INPUT_PCS (the user, 13 Oct). Short length: SHORTLENGTH_MT, the sixth loss — input − production −
 * the five listed losses equals it on 40 of 41 entries (Sep–Oct 2026); added with the user, 13 Oct.
 * Run hours: NET_RUNNING_HRS, the ERP running hours (LSM asset health sheet: Run Hours ← ERP; the
 * user, 22 Oct 2026).
 */
/**
 * The plant's management KPIs as the LSM log sheet holds them per entry (Management Dash All.xlsx, LSM
 * sheet; the user, 23 Nov 2026). Checked on the Oct–Nov 2026 entries: PLANT_AVAILABILITY =
 * NET_RUNNING_HRS ÷ (NET_RUNNING_HRS + DELAY_HRS); PLANT_EFFICIENCY = availability × PLANT_PERFORMANCE;
 * TOTAL_PRODUCTION = PRODUTION_MT + SHORTLENGTH_MT. The sheet's filter P11P is RMS's (division RS):
 * every LSM entry is P6P, so LSM has no Online / Offline split.
 */
export const LSM_KPI_FIELDS = [
  'DELAY_HRS', 'PLANT_AVAILABILITY', 'PLANT_PERFORMANCE', 'PLANT_EFFICIENCY',
  'ROLLING_PERCENTAGE_CASTING', 'ROLLING_PERCENTAGE_DELIVERY', 'TOTAL_PRODUCTION',
] as const;
export const LSM_LOG_FIELDS = [
  'INPUT_MT', 'INPUT_PCS', 'PRODUTION_MT', 'B_LOSS_MT', 'ENDCUT_MT', 'MISROLL_MT', 'COLD_MT', 'REJECT_MT', 'SHORTLENGTH_MT',
  'LSM_BY_PASS_MT', 'CCM_BY_PASS_MT', 'END_CRACK_BY_PASS_CCM_MT', 'NET_RUNNING_HRS', ...LSM_KPI_FIELDS,
] as const;
export type LsmLogField = (typeof LSM_LOG_FIELDS)[number];
export interface LsmLogRow { date: string; vrno: string; v: Record<LsmLogField, number | null> }
/**
 * A finished item received into stores from LSM's production (PROD_TRAN, division LS, items "F…"), per date — what
 * section was rolled that day (the user, 25 Nov 2026). Σ of the non-defective items = the log sheet's PRODUTION_MT
 * on 229 of 234 days (Apr–Nov 2026; the rest are log-sheet entries saved twice or on another date).
 */
export interface LsmReceipt { date: string; item: string; name: string; mt: number }
/**
 * The same for HSM, RMD and RMS (the user, 25 Nov 2026): each receipt's voucher is the REF_VRNO of exactly one
 * log-sheet entry, which gives its rolling (HSM ST001 / ST002, RMD RO001 / RO002). HSM: an entry's receipts = its
 * PRODUCTION_MT on every entry Jun–Nov (166 Online, 109 Offline); RMD: without miss roll = its FINISH_PRODUCT_PRIME_MT
 * on 226 of 281 (never Prime + SL); RMS: = PRODUCTION_MT on 231 of 233 days.
 */
export interface MillReceipt extends LsmReceipt { mode?: 'online' | 'offline' | null }
export interface LsmProductionCache { syncedAt: string; source: string; fromDate: string; rows: LsmLogRow[]; receipts?: LsmReceipt[] }

export function readErpLsmProduction(env: Env): LsmProductionCache | null {
  return readJson<LsmProductionCache>(cachePaths(env).lsmProduction);
}

/** A division's finished stock (LSM: LS, RMS: RS): each item's net movement per date (all godowns but STOR1P), and item names. */
export interface LsmStockCache { syncedAt: string; source: string; moves: { date: string; item: string; netMt: number }[]; items: Record<string, string> }

export function readErpLsmStock(env: Env): LsmStockCache | null {
  return readJson<LsmStockCache>(cachePaths(env).lsmStock);
}

/** RMS Production Log Sheet: one row per entry (division RS, series L5P). */
export interface RmsLogRow {
  date: string; vrno: string; productionMt: number | null; productionPcs: number | null; inputPcs?: number | null;
  /** INPUT_MT1 + INPUT_MT2 (billet input, MT); INPUT_MT when neither is filled (4 of 423 entries); null when none is. */
  inputMt?: number | null;
  /** TOTAL_CAST_QTY and DELIVERY_QTY (= cast − CCM bypass − end crack bypass), MT — what the rolling % divide by. */
  castMt?: number | null;
  deliveryMt?: number | null;
  /** Losses, MT (…_MT1 + …_MT2 where split); null when not filled. */
  burningLossMt?: number | null;
  endCutMt?: number | null;
  missRollMt?: number | null;
  coldMt?: number | null;
  rejectMt?: number | null;
  /** PRIME_MT1 + PRIME_MT2 (prime production, MT); productionMt is the actual production. Null when not filled. */
  primeMt?: number | null;
  /** Defective, MT: DEFECTIVE_CUTMT1/2 + ROLLING_DEFECT_MT1/2 — with prime it makes productionMt. Null when not filled. */
  defectiveMt?: number | null;
  /** The ERP's on-line rolling % of the entry: ROLLING_PERCENTAGE_DELIVERY (billet input ÷ DELIVERY_QTY) and
   *  ROLLING_PERCENATGE_CASTING (billet input ÷ TOTAL_CAST_QTY), × 100. Null when not filled. */
  rollingInDeliveryPct?: number | null;
  rollingInCastingPct?: number | null;
  /** NET_RUNNING_HRS — ERP run hours; null when not filled. */
  runningHrs?: number | null;
}
export interface RmsProductionCache { syncedAt: string; source: string; fromDate: string; rows: RmsLogRow[]; receipts?: MillReceipt[] }

export function readErpRmsProduction(env: Env): RmsProductionCache | null {
  return readJson<RmsProductionCache>(cachePaths(env).rmsProduction);
}

export function readErpRmsStock(env: Env): LsmStockCache | null {
  return readJson<LsmStockCache>(cachePaths(env).rmsStock);
}

/** RMD finished stock: each item's net movement (received − issued, MT) per date in its godown. */
export interface RmdStockMove { date: string; item: string; netMt: number }
/**
 * RMD's finished items (the user, 31 Oct 2026): every item of ERP item schedule F0114 — TMT bars
 * (F011403), miss-roll bars (F011402), rings (F011401) — stocked in godown FGYRDP, which RMD shares
 * with other mills. No other mill's item is in F0114 (checked over all 1,322 items moved in the yard);
 * a new RMD item is counted with no list to update. Replaces the plant's 44-item list (12 Oct 2026),
 * which missed 20 of the 64 F0114 items.
 */
export const RMD_STOCK_RULE = { godown: 'FGYRDP', itemSchPrefix: 'F0114' } as const;

export interface RmdStockCache {
  syncedAt: string; source: string; godown: string;
  /** Every RMD item (ITEM_MAST, item schedule F0114): code and name. */
  items: { code: string; name: string }[];
  moves: RmdStockMove[];
}

export function readErpRmdStock(env: Env): RmdStockCache | null {
  return readJson<RmdStockCache>(cachePaths(env).rmdStock);
}

/**
 * Log-sheet fields pulled per voucher. Chosen because each is verified against another
 * record (see erpKpis.ts checks): production = prime + defective + rolling defect;
 * input = production + burning loss + end cut + miss-roll + reject.
 */
export const LOG_FIELDS = [
  'PRODUCTION_MT', 'PRODUCTION_PCS', 'INPUT_MT', 'INPUT_PCS',
  'PRIME_MT', 'PRIME_PCS', 'DEFECTIVE_MT', 'DEFECTIVE_PCS', 'ROLLING_DEFECT_MT', 'ROLLING_DEFECT_PCS',
  'BLOSS_MT', 'ENDCUT_MT', 'MISSROLL_MT', 'MISSROLL_PCS', 'REJECT_MT', 'REJECTION_PCS',
  // Operator-entered hours; PROD_RATE_ON_RUNNING_HRS = PRODUCTION_MT ÷ NET_RUNNING_HRS (checked 6 Oct 2026).
  'NET_RUNNING_HRS', 'DELAY_HRS',
  // The plant's management KPIs (HSM.xlsx, the user, 23 Nov 2026): cast and delivered quantity, and the
  // entry's power. ROLLING_PERCENTAGE_CASTING = INPUT_MT ÷ TOTAL_CAST_QTY and _DELIVERY = INPUT_MT ÷
  // DELIVERY_QTY (269 of 275 entries, Jun–Nov 2026), so the percentages are worked out from the sums.
  'TOTAL_CAST_QTY', 'DELIVERY_QTY', 'POWER_CONSUMPTION_IN_KWH',
  // Billets cast but not rolled here (performance.xlsx, the user, 25 Nov 2026): TOTAL_CAST_QTY = INPUT_MT +
  // CCM_BY_PASSMT + HSM_BYPASS_MT + END_CRACK_BY_PASS_CCMMT on all 275 entries checked (Jun–Nov 2026).
  'CCM_BY_PASSMT', 'HSM_BYPASS_MT',
  // The ERP's own percentages, shown as filed (the user, 27 Nov 2026): ROLLING_DEFECT_MT ÷ PRODUCTION_MT, and each
  // bypass ÷ TOTAL_CAST_QTY, × 100, per entry.
  'ROLLING_DEFECT_PERCENTAGE', 'CCM_BYPASS_PERCENTAGE', 'HSM_BYPASS_PERCENTAGE',
] as const;
export type LogField = (typeof LOG_FIELDS)[number];
/** Online / Offline: the log sheet head's TRAN_COLUMN_NAME1, ST001 = Online, ST002 = Offline (cold rolling) — HSM.xlsx, 23 Nov 2026. */
export const HSM_MODE_CODES = { ST001: 'online', ST002: 'offline' } as const;
export type HsmLogMode = (typeof HSM_MODE_CODES)[keyof typeof HSM_MODE_CODES];

/**
 * HSM (Hot Strip Mill) daily production, as the ERP Production Log Sheet records it.
 *
 * HSM is ERP division S1 "STRIP MILL" — not RS "Heavy Structure Mill". Settled 30 Sep 2026:
 * the HSM logbook forms describe strip and coils (e.g. strip 2.2 × 280), and S1's daily
 * billet input tracks the HSM Influx counter within a few percent, where RS ran ~3× higher.
 *
 * Source (verified against PROD_TRAN — equal to the finished strip received, every day):
 *   ATTR_TRAN_DATA_HEAD ⋈ ATTR_TRAN_DATA_BODY on ENTITY_CODE, TCODE, TNATURE, SERIES,
 *   ACC_YEAR, VRNO — ENTITY 'MP', DIV 'S1' (Strip Mill), TNATURE 'PRLOG', SERIES 'L6P',
 *   ATTR_CODE 'PRODUCTION_MT'.
 *
 * One ROW PER VOUCHER, not per day: a day can carry several entries and the day's
 * production is their sum. Live entry starts 30 Nov 2025 (ERP cut-over); entries arrive
 * 1.5+ days after the production date.
 */
export interface ErpProductionRow {
  date: string;
  vrno: string;
  /** PRODUCTION_MT, kept at the top level for the production comparison. */
  mt: number | null;
  /** Every LOG_FIELDS value of the voucher; absent in caches from before the field was pulled. */
  v?: Partial<Record<LogField, number | null>>;
  /** Online / Offline; missing on a cache synced before the split. */
  mode?: HsmLogMode | null;
}
export interface ErpProductionCache { syncedAt: string; source: string; fromDate: string; rows: ErpProductionRow[]; receipts?: MillReceipt[] }

export function readErpProduction(env: Env): ErpProductionCache | null {
  return readJson<ErpProductionCache>(cachePaths(env).production);
}

/** Commercial side of HSM: production by item, sales with their order, sales orders. */
export interface ErpCommercialCache {
  syncedAt: string;
  fromDate: string;
  source: string;
  /** item code → item name (the name carries the strip spec, e.g. "MS STRIP (274 - 276 X 2.50) MM"). */
  items: Record<string, string>;
  /** client code → name. */
  clients: Record<string, string>;
  /** PROD_TRAN receipts per day and item (finished strip, defective strip, by-products). */
  prodLines: { date: string; item: string; mt: number }[];
  /** Sale lines of strip items; `order` is the sales order the line was billed against. */
  sales: { date: string; vrno: string; item: string; mt: number; order: string | null; godown: string | null }[];
  /** Sales-order lines for strip items — latest amendment only, cancelled lines dropped. */
  orders: {
    orderNo: string; line: number; date: string; created: string | null; client: string; item: string;
    qty: number; executed: number; cancelled: number; due: string | null;
  }[];
  /**
   * Finished-strip stock, by the plant's stock rule (STOCK_EXCLUDED_TCODES): every S1
   * finished-goods (FG) movement since the ledger starts, in every godown but STOR1P, per
   * day, item and type. `openings` is no longer pulled (the ledger carries the opening).
   * Absent in caches synced before stock was pulled.
   */
  stock?: {
    godown: string;
    moves: { date: string; item: string; type: string; inMt: number; outMt: number }[];
    /** ACC_YEAR like "26-27" → opening MT per item on 1 April of that year. */
    openings: { year: string; item: string; mt: number }[];
  };
}

export function readErpCommercial(env: Env): ErpCommercialCache | null {
  return readJson<ErpCommercialCache>(cachePaths(env).commercial);
}

const memo = new Map<string, { mtimeMs: number; data: unknown }>();

/** Parse a JSON file only when its mtime changes; null if it does not exist or is bad. */
function readJson<T>(file: string): T | null {
  try {
    const { mtimeMs } = statSync(file);
    const hit = memo.get(file);
    if (hit?.mtimeMs === mtimeMs) return hit.data as T;
    const data = JSON.parse(readFileSync(file, 'utf8')) as T;
    memo.set(file, { mtimeMs, data });
    return data;
  } catch {
    return null;
  }
}

/** Each mill's ERP files (its PM file apart: read through readErpPm, so the legacy cache counts). */
const MILL_FILES: Record<ErpMill, (p: ReturnType<typeof cachePaths>) => string[]> = {
  hsm: (p) => [p.cache, p.production, p.commercial],
  rmd: (p) => [p.rmdProduction, p.rmdStock],
  lsm: (p) => [p.lsmProduction, p.lsmStock],
  rms: (p) => [p.rmsProduction, p.rmsStock],
};

/**
 * When each mill's ERP data was last fetched: the OLDEST of its files, so a part that failed to
 * sync (each pull has its own failure) shows the mill as older, not as fresh. Null if any is missing.
 */
export function erpMillSyncedAt(env: Env): Record<ErpMill, string | null> {
  const p = cachePaths(env);
  const of = (m: ErpMill) => {
    const times = [...MILL_FILES[m](p).map((f) => readJson<{ syncedAt?: string }>(f)?.syncedAt), readErpPm(env, m)?.syncedAt];
    if (times.some((t) => !t)) return null;
    return (times as string[]).reduce((a, b) => (Date.parse(b) < Date.parse(a) ? b : a));
  };
  return { hsm: of('hsm'), rmd: of('rmd'), lsm: of('lsm'), rms: of('rms') };
}

export function erpStatus(env: Env, nowMs = Date.now()): ErpStatus {
  const configured = Boolean(env.erpDsn && env.erpUser && env.erpPassword);
  const p = cachePaths(env);
  const cache = readJson<ErpCache>(p.cache);
  const attempt = readJson<ErpSyncAttempt>(p.attempt);
  const syncedAt = cache?.syncedAt ?? null;
  const ageMinutes = syncedAt ? Math.round((nowMs - Date.parse(syncedAt)) / 60_000) : null;

  const message = !cache
    ? (attempt && !attempt.ok ? MSG.ERP_NEVER_REACHED : MSG.ERP_NOT_SYNCED)
    : attempt && !attempt.ok ? MSG.ERP_SYNC_FAILED
    : MSG.ERP_UP;
  return {
    connection: cache && (!attempt || attempt.ok) ? 'up' : 'down',
    configured,
    message,
    syncedAt,
    ageMinutes,
    lastAttempt: attempt,
    divisions: cache?.divisions ?? [],
  };
}
