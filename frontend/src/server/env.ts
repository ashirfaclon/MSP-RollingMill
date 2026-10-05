/**
 * Typed environment for the source connections. Server-side only.
 *
 * Next.js loads `frontend/.env.local` into `process.env` for the app; the ERP sync CLI
 * loads the same file itself (see erp/sync.ts). Read on every call rather than once at
 * import, so tests can set and clear variables per case.
 *
 * One namespace per physical system (INFLUX_* vs EMS_INFLUX_*): a mis-set variable must
 * not be able to query the wrong server and return a plausible number from somewhere else.
 */

export interface Env {
  /* Process historian (InfluxDB v2, over the plant VPN) */
  influxUrl: string | null;
  influxOrg: string | null;
  influxBucket: string | null;
  influxToken: string | null;
  influxUser: string | null;
  influxPassword: string | null;
  /* Electrical EMS — a DIFFERENT InfluxDB */
  emsInfluxUrl: string | null;
  emsInfluxOrg: string | null;
  emsInfluxBucket: string | null;
  emsInfluxToken: string | null;
  /* ERP (Oracle) — read-only, synced offline by a CLI; the app only reads the cache */
  erpDsn: string | null;
  erpUser: string | null;
  erpPassword: string | null;
  erpOracleClientDir: string | null;
  /** Directory (relative to frontend/) holding the sync caches. Gitignored. */
  erpCacheDir: string;
  /* IOsense logbook */
  iosenseBearer: string | null;
  iosenseBase: string;
  iosenseOrg: string;
  /** The Bruce insight that serves this mill's logbook forms. Not yet known for HSM. */
  logbookInsightId: string | null;
  /* App */
  pollIntervalSeconds: number;
}

/** A blank variable is "not configured", never "". */
function opt(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : null;
}

/** A PAT seeds a server-side session; it is sent as a Bearer token. */
function bearerFromEnv(): string | null {
  const b = opt('IOSENSE_BEARER') ?? opt('IOSENSE_PAT');
  if (!b) return null;
  return b.startsWith('Bearer ') ? b : `Bearer ${b}`;
}

export function loadEnv(): Env {
  return {
    influxUrl: opt('INFLUX_URL'),
    influxOrg: opt('INFLUX_ORG'),
    influxBucket: opt('INFLUX_BUCKET'),
    influxToken: opt('INFLUX_TOKEN'),
    influxUser: opt('INFLUX_USER'),
    influxPassword: opt('INFLUX_PASSWORD'),
    emsInfluxUrl: opt('EMS_INFLUX_URL'),
    emsInfluxOrg: opt('EMS_INFLUX_ORG'),
    emsInfluxBucket: opt('EMS_INFLUX_BUCKET') ?? 'EMS Data',
    emsInfluxToken: opt('EMS_INFLUX_TOKEN'),
    erpDsn: opt('ERP_DSN'),
    erpUser: opt('ERP_USER'),
    erpPassword: opt('ERP_PASSWORD'),
    erpOracleClientDir: opt('ERP_ORACLE_CLIENT_DIR'),
    erpCacheDir: opt('ERP_CACHE_DIR') ?? 'data',
    iosenseBearer: bearerFromEnv(),
    iosenseBase: opt('IOSENSE_BASE') ?? 'https://connector.iosense.io',
    iosenseOrg: opt('IOSENSE_ORG') ?? 'https://iosense.io',
    logbookInsightId: opt('IOSENSE_HSM_INSIGHT_ID'),
    pollIntervalSeconds: Number(opt('POLL_INTERVAL_SECONDS') ?? 60),
  };
}
