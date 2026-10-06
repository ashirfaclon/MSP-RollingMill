/**
 * ERP sync — the only code in this service that opens Oracle. Never run from a request:
 * from the CLI (`npm run sync:erp`, jobs/erp-sync.ts) or the optional in-service schedule
 * (jobs/scheduler.ts), which runs the same CLI as a child process.
 *
 * READ-ONLY by construction: thick-mode client (the ERP uses a password verifier the thin
 * driver cannot speak), `SET TRANSACTION READ ONLY`, SELECTs only, scoped to entity MP.
 * Raw rows are cached, not derived results — every KPI is computed in the app, so a change
 * of formula never needs a trip back to the ERP.
 *
 * HSM = Hot Strip Mill = division S1 (see cache.ts). Pulls, all from the ERP cut-over
 * (30 Nov 2025):
 *   erp-hsm.json             division census (proves the connection)
 *   erp-hsm-production.json  Production Log Sheet, one row per voucher with its KPI fields
 *   erp-hsm-commercial.json  production by item, sales with their order, sales orders
 *                            (latest amendment only), item and client names
 *
 * Every attempt writes `erp-hsm-sync.json` (ok or not); only a success rewrites the caches,
 * so a failed sync leaves the previous data in place and says so. The ERP is entered 1.5+
 * days after the production date, so a sync every few hours is plenty.
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import oracledb from 'oracledb';
import { loadEnv, type Env } from '../../config/env';
import {
  ERP_ENTITIES, LOG_FIELDS, cachePaths,
  type ErpCache, type ErpCommercialCache, type ErpDivisionRow, type ErpProductionCache,
  type ErpProductionRow, type ErpSyncAttempt, type LogField,
} from './cache';

/** ERP cut-over: live entry starts here; earlier history is a bulk load. */
const FROM = '2025-11-30';
/** The finished-goods yard where strip is stocked (shared with LSM; strip items are the mill's own). */
const FG_GODOWN = 'FGYRDP';

/** Write via a temp file + rename, so a reader never sees half a file. */
function writeAtomic(file: string, data: unknown) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data));
  renameSync(tmp, file);
}

type Paths = ReturnType<typeof cachePaths>;

function record(p: Paths, t0: number, ok: boolean, message: string) {
  const attempt: ErpSyncAttempt = { attemptedAt: new Date().toISOString(), ok, message, durationMs: Date.now() - t0 };
  writeAtomic(p.attempt, attempt);
}

/** A failure whose message is safe to record in the cache as-is. */
class StatedError extends Error {}

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;

/** The strip items: every finished item S1 has produced since cut-over. */
const S1_ITEMS = `SELECT DISTINCT ITEM_CODE FROM MSPV7ERP1.PROD_TRAN
  WHERE ENTITY_CODE = 'MP' AND DIV_CODE = 'S1' AND QTYRECD > 0 AND ITEM_CODE LIKE 'F%'
    AND VRDATE >= TO_DATE(:fromDate, 'YYYY-MM-DD')`;

async function pull(env: Env, p: Paths, t0: number, log: (line: string) => void) {
  if (!env.erpDsn || !env.erpUser || !env.erpPassword) {
    throw new StatedError('ERP connection not configured');
  }
  oracledb.initOracleClient(env.erpOracleClientDir ? { libDir: env.erpOracleClientDir } : undefined);
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

  const conn = await oracledb.getConnection({ user: env.erpUser, password: env.erpPassword, connectString: env.erpDsn });
  conn.callTimeout = 120_000;
  const q = async <T>(sql: string, binds: oracledb.BindParameters = {}) =>
    ((await conn.execute<T>(sql, binds, { maxRows: 0 })).rows ?? []) as T[];

  let census: ErpCache;
  let production: ErpProductionCache;
  let commercial: ErpCommercialCache;
  try {
    await conn.execute('SET TRANSACTION READ ONLY');
    const syncedAt = new Date().toISOString();

    /* ---- census ---- */
    const clock = await q<{ NOW: string }>(`SELECT TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM') AS "NOW" FROM DUAL`);
    const eBinds = Object.fromEntries(ERP_ENTITIES.map((e, i) => [`e${i}`, e]));
    const divs = await q<{ E: string; D: string; N: number }>(`
      SELECT entity_code AS "E", div_code AS "D", COUNT(*) AS "N" FROM MSPV7ERP1.ASSET_MAST
       WHERE entity_code IN (${ERP_ENTITIES.map((_, i) => `:e${i}`).join(', ')})
       GROUP BY entity_code, div_code ORDER BY entity_code, div_code`, eBinds);
    census = {
      syncedAt, serverTime: clock[0]?.NOW ?? '', source: 'MSPV7ERP1.ASSET_MAST (division census)',
      divisions: divs.map((r): ErpDivisionRow => ({ entity: r.E, division: r.D, assetRows: Number(r.N) })),
    };

    /* ---- Production Log Sheet: one row per voucher, its header KPI fields ---- */
    const pivot = LOG_FIELDS.map((f) =>
      `MAX(CASE WHEN b.ATTR_CODE = '${f}' THEN TO_NUMBER(b.ATTR_VALUE DEFAULT NULL ON CONVERSION ERROR) END) AS "${f}"`,
    ).join(',\n             ');
    const log = await q<Record<string, unknown>>(`
      SELECT TO_CHAR(h.VRDATE, 'YYYY-MM-DD') AS "D", h.VRNO AS "VRNO",
             ${pivot}
        FROM MSPV7ERP1.ATTR_TRAN_DATA_HEAD h
        JOIN MSPV7ERP1.ATTR_TRAN_DATA_BODY b
          ON b.ENTITY_CODE = h.ENTITY_CODE AND b.TCODE = h.TCODE AND b.TNATURE = h.TNATURE
         AND b.SERIES = h.SERIES AND b.ACC_YEAR = h.ACC_YEAR AND b.VRNO = h.VRNO
       WHERE h.ENTITY_CODE = 'MP' AND h.DIV_CODE = 'S1' AND h.TNATURE = 'PRLOG' AND h.SERIES = 'L6P'
         AND h.VRDATE >= TO_DATE(:fromDate, 'YYYY-MM-DD')
       GROUP BY h.VRDATE, h.VRNO
       ORDER BY h.VRDATE, h.VRNO`, { fromDate: FROM });
    const rows: ErpProductionRow[] = log.map((r) => {
      const v = Object.fromEntries(LOG_FIELDS.map((f) => [f, num(r[f])])) as Record<LogField, number | null>;
      return { date: String(r.D), vrno: String(r.VRNO), mt: v.PRODUCTION_MT, v };
    });
    production = { syncedAt, source: 'ATTR_TRAN_DATA_HEAD/BODY · MP/S1 · PRLOG/L6P', fromDate: FROM, rows };

    /* ---- production by item (PROD_TRAN receipts) ---- */
    const lines = await q<{ D: string; ITEM: string; MT: number }>(`
      SELECT TO_CHAR(TRUNC(VRDATE), 'YYYY-MM-DD') AS "D", ITEM_CODE AS "ITEM", ROUND(SUM(QTYRECD), 3) AS "MT"
        FROM MSPV7ERP1.PROD_TRAN
       WHERE ENTITY_CODE = 'MP' AND DIV_CODE = 'S1' AND NVL(CANCELLED_FLAG, 'N') <> 'Y'
         AND VRDATE >= TO_DATE(:fromDate, 'YYYY-MM-DD') AND NVL(QTYRECD, 0) > 0
       GROUP BY TRUNC(VRDATE), ITEM_CODE ORDER BY 1, 2`, { fromDate: FROM });

    /* ---- sales of strip items, with the order each line was billed against ---- */
    const sales = await q<{ D: string; VRNO: string; ITEM: string; MT: number; ORD: string | null; GODOWN: string | null }>(`
      SELECT TO_CHAR(t.VRDATE, 'YYYY-MM-DD') AS "D", t.VRNO AS "VRNO", t.ITEM_CODE AS "ITEM",
             t.QTYISSUED AS "MT", t.ORDER_VRNO AS "ORD", t.GODOWN_CODE AS "GODOWN"
        FROM MSPV7ERP1.ITEMTRAN_BODY t
       WHERE t.ENTITY_CODE = 'MP' AND t.TNATURE = 'SALE' AND t.VRDATE >= TO_DATE(:fromDate, 'YYYY-MM-DD')
         AND NVL(t.QTYISSUED, 0) > 0 AND t.ITEM_CODE IN (${S1_ITEMS})
       ORDER BY t.VRDATE, t.VRNO`, { fromDate: FROM });

    /* ---- sales orders for strip items: latest amendment of each line only ---- */
    const orders = await q<{
      VRNO: string; SLNO: number; D: string; CREATED: string | null; ACC: string; ITEM: string;
      QTY: number; EXEC: number | null; CANC: number | null; DUE: string | null; CXL: string | null;
    }>(`
      SELECT b.VRNO AS "VRNO", b.SLNO AS "SLNO", TO_CHAR(b.VRDATE, 'YYYY-MM-DD') AS "D",
             TO_CHAR(b.CREATEDDATE, 'YYYY-MM-DD"T"HH24:MI') AS "CREATED", h.ACC_CODE AS "ACC", b.ITEM_CODE AS "ITEM",
             b.QTYORDER AS "QTY", b.QTYEXECUTED AS "EXEC", b.QTYCANCELLED AS "CANC",
             TO_CHAR(b.DUEDATE, 'YYYY-MM-DD') AS "DUE", b.CANCELLED_FLAG AS "CXL"
        FROM MSPV7ERP1.ORDER_BODY b
        JOIN MSPV7ERP1.ORDER_HEAD h
          ON h.ENTITY_CODE = b.ENTITY_CODE AND h.TNATURE = b.TNATURE AND h.SERIES = b.SERIES
         AND h.VRNO = b.VRNO AND NVL(h.AMENDNO, 0) = NVL(b.AMENDNO, 0)
       WHERE b.ENTITY_CODE = 'MP' AND b.TNATURE = 'SORD' AND b.VRDATE >= TO_DATE(:fromDate, 'YYYY-MM-DD')
         AND b.ITEM_CODE IN (${S1_ITEMS})
         AND NVL(b.AMENDNO, 0) = (SELECT MAX(NVL(x.AMENDNO, 0)) FROM MSPV7ERP1.ORDER_BODY x
                                   WHERE x.ENTITY_CODE = b.ENTITY_CODE AND x.TNATURE = b.TNATURE
                                     AND x.SERIES = b.SERIES AND x.VRNO = b.VRNO AND x.SLNO = b.SLNO)
       ORDER BY b.VRDATE, b.VRNO, b.SLNO`, { fromDate: FROM });

    /* ---- finished-strip stock: every movement in the FG yard, and each year's opening ---- */
    // Movements that change stock: production in, sale out, item-to-item transfer (M2M) and
    // sales returns. Loading advices (LADV, stock flag 4) only reserve stock — left out.
    const stockMoves = await q<{ D: string; ITEM: string; TN: string; RECD: number; ISS: number }>(`
      SELECT TO_CHAR(TRUNC(t.VRDATE), 'YYYY-MM-DD') AS "D", t.ITEM_CODE AS "ITEM", t.TNATURE AS "TN",
             ROUND(SUM(NVL(t.QTYRECD, 0)), 3) AS "RECD", ROUND(SUM(NVL(t.QTYISSUED, 0)), 3) AS "ISS"
        FROM MSPV7ERP1.ITEMTRAN_BODY t
       WHERE t.ENTITY_CODE = 'MP' AND t.GODOWN_CODE = :godown AND t.VRDATE >= TO_DATE(:fromDate, 'YYYY-MM-DD')
         AND t.TNATURE IN ('PROD', 'SALE', 'M2M', 'SRET') AND NVL(t.STOCK_FLAG, '1') <> '4'
         AND t.ITEM_CODE IN (${S1_ITEMS})
       GROUP BY TRUNC(t.VRDATE), t.ITEM_CODE, t.TNATURE ORDER BY 1, 2, 3`, { fromDate: FROM, godown: FG_GODOWN });
    // Opening stock per financial year (1 April). Empty for 25-26 and 26-27 at the time of writing.
    const openings = await q<{ Y: string; ITEM: string; QTY: number }>(`
      SELECT o.ACC_YEAR AS "Y", o.ITEM_CODE AS "ITEM", ROUND(SUM(NVL(o.YROPQTY, 0)), 3) AS "QTY"
        FROM MSPV7ERP1.ITEMOPBAL_MAST o
       WHERE o.ENTITY_CODE = 'MP' AND o.GODOWN_CODE = :godown AND o.ITEM_CODE IN (${S1_ITEMS})
       GROUP BY o.ACC_YEAR, o.ITEM_CODE ORDER BY 1, 2`, { fromDate: FROM, godown: FG_GODOWN });

    /* ---- names ---- */
    const itemCodes = [...new Set([...lines.map((r) => r.ITEM), ...sales.map((r) => r.ITEM), ...orders.map((r) => r.ITEM), ...stockMoves.map((r) => r.ITEM), ...openings.map((r) => r.ITEM)])];
    const items: Record<string, string> = {};
    for (let i = 0; i < itemCodes.length; i += 500) {
      const chunk = itemCodes.slice(i, i + 500);
      const b = Object.fromEntries(chunk.map((c, j) => [`c${j}`, c]));
      for (const r of await q<{ C: string; N: string }>(
        `SELECT ITEM_CODE AS "C", ITEM_NAME AS "N" FROM MSPV7ERP1.ITEM_MAST WHERE ITEM_CODE IN (${chunk.map((_, j) => `:c${j}`).join(', ')})`, b,
      )) items[r.C] = r.N;
    }
    const accCodes = [...new Set(orders.map((r) => r.ACC))];
    const clients: Record<string, string> = {};
    if (accCodes.length) {
      const b = Object.fromEntries(accCodes.map((c, j) => [`a${j}`, c]));
      for (const r of await q<{ C: string; N: string }>(
        `SELECT ACC_CODE AS "C", MAX(ACC_NAME) AS "N" FROM MSPV7ERP1.ACC_MAST WHERE ACC_CODE IN (${accCodes.map((_, j) => `:a${j}`).join(', ')}) GROUP BY ACC_CODE`, b,
      )) clients[r.C] = r.N;
    }

    commercial = {
      syncedAt, fromDate: FROM,
      source: 'PROD_TRAN (S1 receipts) · ITEMTRAN_BODY (SALE) · ORDER_HEAD/BODY (SORD, latest amendment)',
      items, clients,
      prodLines: lines.map((r) => ({ date: r.D, item: r.ITEM, mt: Number(r.MT) })),
      sales: sales.map((r) => ({ date: r.D, vrno: r.VRNO, item: r.ITEM, mt: Number(r.MT), order: r.ORD ?? null, godown: r.GODOWN ?? null })),
      orders: orders
        .filter((r) => (r.CXL ?? 'N') !== 'Y')
        .map((r) => ({
          orderNo: r.VRNO, line: Number(r.SLNO), date: r.D, created: r.CREATED, client: r.ACC, item: r.ITEM,
          qty: Number(r.QTY), executed: num(r.EXEC) ?? 0, cancelled: num(r.CANC) ?? 0, due: r.DUE,
        })),
      stock: {
        godown: FG_GODOWN,
        moves: stockMoves.map((r) => ({ date: r.D, item: r.ITEM, type: r.TN, inMt: Number(r.RECD), outMt: Number(r.ISS) })),
        openings: openings.map((r) => ({ year: r.Y, item: r.ITEM, mt: Number(r.QTY) })),
      },
    };
  } finally {
    await conn.close();
  }

  writeAtomic(p.cache, census);
  writeAtomic(p.production, production);
  writeAtomic(p.commercial, commercial);
  const last = production.rows.at(-1)?.date ?? 'none';
  record(p, t0, true, `Synced ${production.rows.length} log-sheet entries, ${commercial.sales.length} sale lines, ${commercial.orders.length} order lines`);
  log(`ERP sync ok in ${Date.now() - t0} ms · server time ${census.serverTime}`);
  log(`  HSM log sheet: ${production.rows.length} entries, ${production.fromDate} → ${last}`);
  log(`  production by item: ${commercial.prodLines.length} rows · sales: ${commercial.sales.length} lines · orders: ${commercial.orders.length} lines`);
  log(`  names: ${Object.keys(commercial.items).length} items, ${Object.keys(commercial.clients).length} clients`);
  log(`  stock: ${commercial.stock?.moves.length ?? 0} movement rows · openings for years ${[...new Set((commercial.stock?.openings ?? []).map((o) => o.year))].join(', ') || 'none'}`);
}

export interface ErpSyncResult { ok: boolean; message: string; durationMs: number }

/**
 * One sync: pull, write the caches atomically, record the attempt. Never throws — a failure
 * is recorded (previous caches stay in place) and returned.
 */
export async function runErpSync(env: Env = loadEnv(), log: (line: string) => void = console.log): Promise<ErpSyncResult> {
  const t0 = Date.now();
  const p = cachePaths(env);
  mkdirSync(p.dir, { recursive: true });
  try {
    await pull(env, p, t0, log);
    return { ok: true, message: 'ERP synced', durationMs: Date.now() - t0 };
  } catch (err) {
    // Oracle error text can name hosts and services — keep it in the log, not the cache.
    const message = err instanceof StatedError ? err.message : 'ERP sync failed';
    record(p, t0, false, message);
    log(`ERP sync failed: ${(err as Error).message}`);
    return { ok: false, message, durationMs: Date.now() - t0 };
  }
}
