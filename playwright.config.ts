import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_INITIAL_PASSWORD,
  TEST_ADMIN_NAME,
  TEST_INJECT_TOKEN,
} from './e2e/auth-constants';

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
        command: 'mkdir -p e2e/.tmp && rm -f e2e/.tmp/gridcity.test.db* && npm run build && node dist/server.cjs',
        url: `${baseURL}/health`,
        reuseExistingServer: false,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
        cwd: configDir,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: String(port),
          GRIDCITY_SKIP_VERSION_BUMP: '1',
          GRIDCITY_DB: path.join(configDir, 'e2e/.tmp/gridcity.test.db'),
          GRIDCITY_ADMIN_EMAIL: TEST_ADMIN_EMAIL,
          GRIDCITY_ADMIN_NAME: TEST_ADMIN_NAME,
          GRIDCITY_ADMIN_INITIAL_PASSWORD: TEST_ADMIN_INITIAL_PASSWORD,
          GRIDCITY_ADMIN_PASSWORD: '',
          GRIDCITY_ADMIN_FORCE_CHANGE: '1',
          GRIDCITY_LOGIN_RATE_LIMIT: '10000',
          GRIDCITY_TZ: 'America/New_York',
          GRIDBOT_ESCALATE_INJECT_TOKEN: TEST_INJECT_TOKEN,
          GRIDBOT_INJECT_TOKEN: '',
          GRIDBOT_ESCALATE_WEBHOOK_URL: '',
          GRIDBOT_ESCALATE_WEBHOOK_AUTH: '',
          QUICK_TASK_DEFAULT_ASSIGNEE: TEST_ADMIN_EMAIL,
          QUICK_TASK_PLAYER_TOAST: 'Task added.',
        },
      }
    : undefined,
});
