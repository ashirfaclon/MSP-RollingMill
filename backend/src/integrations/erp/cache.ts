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
import type { ErpDivisionRow, ErpSyncAttempt, ErpStatus } from '../../contracts';
export type { ErpDivisionRow, ErpSyncAttempt, ErpStatus };

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
  };
};

/**
 * RMD log-sheet codes, exactly as the plant gave them (RMD - ERP Data Filled.xlsx, 10 Oct
 * 2026): table ATTR_TRAN_DATA_BODY, USER_CODE = 'FA-SKJ', ATTR_CODE → ATTR_VALUE, dated by
 * VRDATE. Two spellings differ from the sheet (MISSROLL_MT → MISROLL_MT, CHIP_OFF →
 * CHIP_OFF_MT): the sheet's spelling returned no rows; these are the codes in the table,
 * confirmed with the user. Chip off is the plant's rejection.
 */
export const RMD_LOG_FIELDS = ['INPUT_MT', 'ACTUAL_RUNNING_HRS', 'PRODUCT_PRIME_SLENGTH_MT', 'FINISH_PRODUCT_PRIME_MT', 'BLOSS_MT', 'ENDCUT_MT', 'MISROLL_MT', 'CHIP_OFF_MT'] as const;
export type RmdLogField = (typeof RMD_LOG_FIELDS)[number];
export interface RmdLogRow { date: string; vrno: string; v: Record<RmdLogField, number | null> }
export interface RmdProductionCache { syncedAt: string; source: string; fromDate: string; rows: RmdLogRow[] }

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
export const LSM_LOG_FIELDS = [
  'INPUT_MT', 'INPUT_PCS', 'PRODUTION_MT', 'B_LOSS_MT', 'ENDCUT_MT', 'MISROLL_MT', 'COLD_MT', 'REJECT_MT', 'SHORTLENGTH_MT',
  'LSM_BY_PASS_MT', 'CCM_BY_PASS_MT', 'END_CRACK_BY_PASS_CCM_MT', 'NET_RUNNING_HRS',
] as const;
export type LsmLogField = (typeof LSM_LOG_FIELDS)[number];
export interface LsmLogRow { date: string; vrno: string; v: Record<LsmLogField, number | null> }
export interface LsmProductionCache { syncedAt: string; source: string; fromDate: string; rows: LsmLogRow[] }

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
  /** INPUT_MT1 + INPUT_MT2 (billet input, MT); null when neither is filled. */
  inputMt?: number | null;
  /** Losses, MT (…_MT1 + …_MT2 where split); null when not filled. */
  burningLossMt?: number | null;
  endCutMt?: number | null;
  missRollMt?: number | null;
  coldMt?: number | null;
  rejectMt?: number | null;
  /** NET_RUNNING_HRS — ERP run hours; null when not filled. */
  runningHrs?: number | null;
}
export interface RmsProductionCache { syncedAt: string; source: string; fromDate: string; rows: RmsLogRow[] }

export function readErpRmsProduction(env: Env): RmsProductionCache | null {
  return readJson<RmsProductionCache>(cachePaths(env).rmsProduction);
}

export function readErpRmsStock(env: Env): LsmStockCache | null {
  return readJson<LsmStockCache>(cachePaths(env).rmsStock);
}

/** RMD finished stock: each item's net movement (received − issued, MT) per date in its godown. */
export interface RmdStockMove { date: string; item: string; netMt: number }
export interface RmdStockCache { syncedAt: string; source: string; godown: string; moves: RmdStockMove[] }

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
] as const;
export type LogField = (typeof LOG_FIELDS)[number];

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
}
export interface ErpProductionCache { syncedAt: string; source: string; fromDate: string; rows: ErpProductionRow[] }

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
