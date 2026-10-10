import { defineConfig, devices } from '@playwright/test';
import { webURL } from './environment.mjs';

const channel = process.env.MIZANO_BROWSER_CHANNEL;
if (channel && channel !== 'chrome')
  throw new Error('Only the optional local chrome channel is supported');

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.journey.mjs',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  forbidOnly: true,
  globalSetup: './servers.mjs',
  reporter: [['./metadata-reporter.mjs']],
  outputDir: process.env.MIZANO_BROWSER_MUTATION
    ? `.test-results/browser-negative-${process.env.MIZANO_BROWSER_MUTATION}`
    : '.test-results/browser',
  // Auth and financial payloads must never be persisted in traces/HAR/video.
  use: {
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    baseURL: webURL,
    channel,
    timezoneId: 'Africa/Cairo',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'chromium-mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } },
    },
  ],
});
