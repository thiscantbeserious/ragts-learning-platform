/**
 * Visual regression tests for the landing page (StartPage within SpatialShell).
 * Covers empty state, populated states, upload interactions, and session management.
 */
import { test, expect } from '@playwright/test';
import { uploadFixture, waitForProcessing, deleteAllSessions, seedSessionFixture } from '../helpers/seed-visual-data';

test.describe('Landing Page', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await deleteAllSessions();
  });

  test('empty state — no sessions', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.start-page .upload-zone', { timeout: 10000 });
    await expect(page).toHaveScreenshot('landing-empty-state.png', {
      mask: [page.locator('.shell-header')],
    });
  });

  test('with 1 session uploaded', async ({ page }) => {
    const id = await uploadFixture('valid-with-markers.cast');
    await waitForProcessing(id);

    await page.goto('/');
    await page.waitForSelector('.session-card', { timeout: 10000 });
    await expect(page).toHaveScreenshot('landing-one-session.png', {
      mask: [page.locator('.session-card__age')],
    });
  });

  test('with 3 sessions — grid layout', async ({ page }) => {
    await deleteAllSessions();
    for (const fixture of ['valid-with-markers.cast', 'valid-without-markers.cast', 'valid-with-markers.cast']) {
      const id = await uploadFixture(fixture);
      await waitForProcessing(id);
    }

    await page.goto('/');
    await page.waitForSelector('.spatial-shell__sidebar .session-card', { timeout: 10000 });
    const cards = page.locator('.spatial-shell__sidebar .session-card');
    await expect(cards).toHaveCount(3);
    await expect(page).toHaveScreenshot('landing-three-sessions.png', {
      mask: [page.locator('.session-card__age')],
    });
  });

  test('upload zone — default state', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.start-page .upload-zone', { timeout: 10000 });
    await expect(page.locator('.start-page .upload-zone')).toHaveScreenshot('upload-zone-default.png');
  });

  test('upload in progress — optimistic card visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.start-page__file-input', { timeout: 10000 });

    // Mock slow upload by intercepting
    await page.route('**/api/upload', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.continue();
    });

    // Trigger file upload via hidden input
    const fileInput = page.locator('.start-page__file-input');
    await fileInput.setInputFiles({
      name: 'test.cast',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('{"version":3,"term":{"cols":80,"rows":24}}\n[0.1,"o","hello\\n"]\n'),
    });

    // Wait for optimistic card to appear in the sidebar
    const processingCard = page.locator('.session-card--processing');
    await expect(processingCard).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.sidebar-panel')).toHaveScreenshot('upload-zone-uploading.png');
  });

  test('session card hover', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.session-card', { timeout: 10000 });

    const card = page.locator('.session-card').first();
    await card.hover();
    await expect(page).toHaveScreenshot('landing-card-hover.png', {
      mask: [page.locator('.session-card__age')],
    });
  });

  test('after delete — session removed', async ({ page }) => {
    await seedSessionFixture();

    await page.goto('/');
    await page.waitForSelector('.session-card', { timeout: 10000 });

    // Delete session via API (no delete UI button in new sidebar design)
    await deleteAllSessions();

    // Navigate again to see empty state
    await page.goto('/');
    await page.waitForSelector('.start-page .upload-zone', { timeout: 10000 });
    await expect(page).toHaveScreenshot('landing-after-delete.png', {
      mask: [page.locator('.shell-header')],
    });
  });

  test('shell header renders correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.shell-header', { timeout: 10000 });
    await expect(page.locator('.shell-header')).toHaveScreenshot('shell-header.png');
  });
});
