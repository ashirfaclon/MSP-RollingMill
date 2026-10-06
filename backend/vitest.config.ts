import { defineConfig } from 'vitest/config';

/**
 * `unit`: no plant access — arithmetic, degraded paths, and every route through
 * `app.inject()`. `live`: talks to the real historian / ERP cache / logbook; each suite
 * skips itself when its source is not configured.
 */
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['test/unit/**/*.test.ts', 'test/routes/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'live', include: ['test/live/**/*.test.ts'], environment: 'node', testTimeout: 120_000, hookTimeout: 120_000 } },
    ],
  },
});
