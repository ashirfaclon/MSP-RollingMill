import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PW_PORT ?? 3107);
/** The backend the frontend proxies /api to (next.config.ts) — started here if not running. */
const API_PORT = Number(process.env.PW_API_PORT ?? 8521);

/** E2E against the production build (`npm run build` first) and the backend service. */
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
  webServer: [
    {
      command: `npm --prefix ../backend run dev`,
      url: `http://localhost:${API_PORT}/api/health`,
      env: { PORT: String(API_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/hsm/visualization`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
