/**
 * Playwright configuration for acceptance tests.
 *
 * Connects to the already-running dev server on port 5173.
 * Does NOT start a web server — assumes `npm run dev` is active.
 *
 * Run with:
 *   npx playwright test --config=tests/acceptance/playwright.config.ts
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['*.acceptance.test.ts', '*.temp.test.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        // Enable precise memory info for heap measurements (AC-10)
        launchOptions: {
          args: ['--enable-precise-memory-info'],
        },
      },
    },
  ],
  // No webServer — dev server must already be running on port 5173
});
