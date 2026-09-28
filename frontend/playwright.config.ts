import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PW_PORT ?? 3107);

/** E2E against the production build (`npm run build` first). */
export default defineConfig({
  testDir: './src/tests',
  outputDir: './test-results',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Desktop Chrome'],
    viewport: { width: 1600, height: 900 },
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/hsm/visualization`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
