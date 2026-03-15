import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

// Load test-specific env vars — isolated ports and data directory
// so visual tests never touch the developer's local database.
config({ path: '.env.test' });

const SERVER_PORT = process.env.PORT || '3001';
const CLIENT_PORT = process.env.VITE_PORT || '5174';
const DATA_DIR = process.env.DATA_DIR || 'tests/.test-data';

export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Serial: tests share a single DB and server
  reporter: 'html',
  timeout: 60000,
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.03,
      threshold: 0.2,
    },
  },
  snapshotPathTemplate: 'tests/visual/__screenshots__/{testFilePath}/{arg}{ext}',
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
  webServer: [
    {
      command: `DATA_DIR=${DATA_DIR} PORT=${SERVER_PORT} npm run dev:server`,
      url: `http://localhost:${SERVER_PORT}/api/sessions`,
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: `VITE_PORT=${CLIENT_PORT} VITE_API_PORT=${SERVER_PORT} npx vite`,
      url: `http://localhost:${CLIENT_PORT}`,
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
