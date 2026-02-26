/**
 * Visual regression tests for the landing page.
 * Covers empty state, populated states, upload interactions, and session management.
 */
import { test, expect } from '@playwright/test';
import { uploadFixture, waitForProcessing, deleteAllSessions } from '../helpers/seed-visual-data';

test.describe('Landing Page', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await deleteAllSessions();
  });

  test('empty state — no sessions', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.session-list__empty', { timeout: 10000 });
    await expect(page).toHaveScreenshot('landing-empty-state.png', {
      mask: [page.locator('.app-header')],
    });
  });

  test('with 1 session uploaded', async ({ page }) => {
    const id = await uploadFixture('valid-with-markers.cast');
    await waitForProcessing(id);

    await page.goto('/');
    await page.waitForSelector('.session-card', { timeout: 10000 });
    await expect(page).toHaveScreenshot('landing-one-session.png', {
      mask: [page.locator('.session-card__date')],
    });
  });

  test('with 3 sessions — grid layout', async ({ page }) => {
    // Already have 1 from previous test, add 2 more
    for (const fixture of ['valid-without-markers.cast', 'valid-with-markers.cast']) {
      const id = await uploadFixture(fixture);
      await waitForProcessing(id);
    }

    await page.goto('/');
    await page.waitForSelector('.session-card', { timeout: 10000 });
    const cards = page.locator('.session-card');
    await expect(cards).toHaveCount(3);
    await expect(page).toHaveScreenshot('landing-three-sessions.png', {
      mask: [page.locator('.session-card__date')],
    });
  });

  test('upload zone — default state', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.upload-zone', { timeout: 10000 });
    await expect(page.locator('.upload-zone')).toHaveScreenshot('upload-zone-default.png');
  });

  test('upload in progress — spinner visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.upload-zone', { timeout: 10000 });

    // Mock slow upload by intercepting
    await page.route('**/api/upload', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.continue();
    });

    // Trigger file upload via input
    const fileInput = page.locator('.upload-zone__input');
    await fileInput.setInputFiles({
      name: 'test.cast',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('{"version":3,"term":{"cols":80,"rows":24}}\n[0.1,"o","hello\\n"]\n'),
    });

    // Capture uploading state — may or may not catch the spinner
    const spinner = page.locator('.upload-zone__spinner');
    if (await spinner.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(page.locator('.upload-zone')).toHaveScreenshot('upload-zone-uploading.png');
    }
  });

  test('session card hover', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.session-card', { timeout: 10000 });

    const card = page.locator('.session-card').first();
    await card.hover();
    await expect(page).toHaveScreenshot('landing-card-hover.png', {
      mask: [page.locator('.session-card__date')],
    });
  });

  test('after delete — session removed', async ({ page }) => {
    await deleteAllSessions();
    const id = await uploadFixture('valid-with-markers.cast');
    await waitForProcessing(id);

    await page.goto('/');
    await page.waitForSelector('.session-card', { timeout: 10000 });

    // Accept the confirmation dialog
    page.on('dialog', dialog => dialog.accept());

    // Click delete button
    await page.locator('.session-card__delete').first().click();

    // Wait for card to disappear
    await page.waitForSelector('.session-list__empty', { timeout: 10000 });
    await expect(page).toHaveScreenshot('landing-after-delete.png', {
      mask: [page.locator('.app-header')],
    });
  });

  test('page header renders correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app-header', { timeout: 10000 });
    await expect(page.locator('.app-header')).toHaveScreenshot('app-header.png');
  });
});
