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
  return cfg;
}
