import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const startLocalServer = !process.env.PLAYWRIGHT_BASE_URL;

/**
 * GridCity Playwright config.
 *
 * Default: builds the production bundle and serves it on :4173 with an isolated
 * SQLite file (e2e/.tmp/gridcity.test.db) so tests never touch gridcity.db.
 *
 * Against an already-running app (Docker on :3001, local vite, etc.):
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npm test
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: startLocalServer
    ? {
        command: 'mkdir -p e2e/.tmp && npm run build && node dist/server.cjs',
        url: `${baseURL}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
        cwd: configDir,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: String(port),
          GRIDCITY_SKIP_VERSION_BUMP: '1',
          GRIDCITY_DB: path.join(configDir, 'e2e/.tmp/gridcity.test.db'),
        },
      }
    : undefined,
});
