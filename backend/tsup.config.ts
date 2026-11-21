import { defineConfig } from 'tsup';

/**
 * Three entry points, bundled to plain ESM for Node 22: the API server, the ERP sync job and the alert sender.
 * Dependencies stay external (installed with `npm ci --omit=dev`), so the native Oracle
 * driver is loaded from node_modules, never bundled.
 */
export default defineConfig({
  entry: { server: 'src/server.ts', 'erp-sync': 'src/jobs/erp-sync.ts', 'alert-sender': 'src/modules/alerts/sender/main.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  splitting: false,
});
