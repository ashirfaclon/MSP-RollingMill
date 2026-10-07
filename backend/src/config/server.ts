/**
 * HTTP service settings, validated once at startup. A bad value stops the process with a
 * message naming the variable — never a silent default in production.
 *
 * Source connections (historian, EMS, ERP, logbook) live in env.ts and are read per call,
 * so an unconfigured source is a stated state ("not configured"), not a startup failure.
 */
import { z } from 'zod';

const list = z
  .string()
  .default('')
  .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean));

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .default('')
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Browser origins allowed to call the API, comma-separated (e.g. https://hsm.example.com). */
  CORS_ORIGINS: list,
  /** Behind a load balancer / reverse proxy: trust X-Forwarded-* for the client IP. */
  TRUST_PROXY: bool,
  /** Requests per minute per client IP. 0 disables the limit. */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(0).default(600),
  /** Run the ERP sync every N minutes inside this service. 0 = off (run `sync:erp` from cron instead). */
  ERP_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(0),

  /* --- Access: the app opens only from IOsense, through its one-time SSO token --- */
  /** Local development only — every route open, no IOsense sign-in. Refused in production. */
  AUTH_DISABLED: bool,
  /** Signs app sessions (HMAC). ≥ 32 characters; keep it stable so sessions survive a restart. */
  SESSION_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(32, 'must be at least 32 characters').optional()),
  /** How long a session lasts after the IOsense sign-in. */
  SESSION_TTL_HOURS: z.coerce.number().positive().max(168).default(12),
  /** IOsense organisation ids allowed in, comma-separated. Empty = any organisation IOsense signs in. */
  AUTH_ALLOWED_ORGANISATIONS: list,
});

export type ServerConfig = z.infer<typeof schema>;

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration — ${issues}`);
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === 'production' && cfg.CORS_ORIGINS.includes('*')) {
    throw new Error('Invalid configuration — CORS_ORIGINS must list the frontend origin(s), not "*", in production');
  }
  if (cfg.NODE_ENV === 'production' && cfg.AUTH_DISABLED) {
    throw new Error('Invalid configuration — AUTH_DISABLED cannot be used in production');
  }
  return cfg;
}
