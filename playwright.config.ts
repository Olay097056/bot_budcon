import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for bot_budcon.
 *
 * Why Firefox only: the previous TTM bot session established that
 * TTM's bot detection is most easily satisfied by Firefox (TLS
 * fingerprint + sensor cookies line up with what Akamai /
 * HWWAF expect). Chromium is not used here.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Firefox'],
    baseURL: 'http://localhost:7890',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    headless: false,
    launchOptions: {
      args: ['--no-sandbox'],
    },
  },
  projects: [
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
