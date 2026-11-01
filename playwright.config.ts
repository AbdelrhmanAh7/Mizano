import { defineConfig, devices } from '@playwright/test';
import { API_PORT, WEB_PORT, WEB_URL, apiEnv, isRemote, webEnv } from './e2e-browser/env';

/**
 * Browser journeys (docs/E2E-BROWSER.md): real Chromium against a local API and web app on a throwaway
 * database (`pnpm e2e:up`). Never the public site. Every test registers its own account.
 */
export default defineConfig({
  testDir: './e2e-browser/tests',
  ...(isRemote ? {} : { globalSetup: './e2e-browser/global-setup.ts' }),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: WEB_URL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Against a deployed copy (E2E_BASE_URL) nothing is started locally.
  webServer: isRemote
    ? undefined
    : [
        {
          command: 'pnpm --filter api exec nest start',
          url: `http://127.0.0.1:${API_PORT}/api/health/live`,
          reuseExistingServer: !process.env.CI,
          timeout: 240_000,
          stderr: 'pipe',
          env: apiEnv,
        },
        {
          command: `pnpm --filter @mizano/web exec next dev -p ${WEB_PORT}`,
          url: `${WEB_URL}/en/login`,
          reuseExistingServer: !process.env.CI,
          timeout: 240_000,
          stderr: 'ignore',
          env: webEnv,
        },
      ],
});
