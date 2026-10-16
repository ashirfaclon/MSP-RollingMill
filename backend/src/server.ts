/**
 * Entry point: validate configuration, start the HTTP server, optionally schedule the ERP
 * sync, and shut down gracefully — readiness flips to 503 first so a load balancer stops
 * sending traffic, then in-flight requests finish before the process exits.
 */
import { buildApp } from './app';
import { loadServerConfig } from './config/server';
import { startErpSyncSchedule } from './jobs/scheduler';

const SHUTDOWN_GRACE_MS = 10_000;

async function main() {
  const config = loadServerConfig();
  const lifecycle = { shuttingDown: false };
  const app = await buildApp({ config, lifecycle });
  await app.listen({ host: config.HOST, port: config.PORT });

  const stopSync = startErpSyncSchedule(config.ERP_SYNC_INTERVAL_MINUTES, app.log);

  const shutdown = async (signal: string) => {
    if (lifecycle.shuttingDown) return;
    lifecycle.shuttingDown = true;
    app.log.info({ signal }, 'shutting down');
    stopSync();
    const force = setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS);
    force.unref();
    await app.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: Error) => {
  // Configuration errors name the variable; nothing secret is in them.
  console.error(err.message);
  process.exit(1);
});
