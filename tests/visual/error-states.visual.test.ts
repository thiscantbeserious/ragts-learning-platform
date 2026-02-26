/**
 * Visual regression tests for error states.
 * Covers 404, network errors, empty sessions, and invalid uploads.
 */
import { test, expect } from '@playwright/test';
import { deleteAllSessions } from '../helpers/seed-visual-data';

test.describe('Error States', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await deleteAllSessions();
  });

  test('404 — invalid session ID', async ({ page }) => {
    await page.goto('/session/invalid-session-id-does-not-exist');
    await page.waitForTimeout(3000);

    await expect(page).toHaveScreenshot('error-404-invalid-session.png', {
      mask: [page.locator('.app-header')],
    });
  });

  test('nonexistent route', async ({ page }) => {
    await page.goto('/nonexistent-route');
    await page.waitForTimeout(2000);

    await expect(page).toHaveScreenshot('error-nonexistent-route.png', {
      mask: [page.locator('.app-header')],
    });
  });

  test('empty session list — prompt to upload', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.session-list__empty', { timeout: 10000 });

    const emptyMessage = page.locator('.session-list__empty');
    await expect(emptyMessage).toBeVisible();
    await expect(emptyMessage).toHaveScreenshot('error-empty-session-list.png');
  });

  test('upload of non-.cast file shows error', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.upload-zone', { timeout: 10000 });

    const fileInput = page.locator('.upload-zone__input');
    await fileInput.setInputFiles({
      name: 'invalid.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('This is not a cast file'),
    });

    await page.waitForTimeout(2000);
    await expect(page.locator('.upload-zone')).toHaveScreenshot('error-invalid-file-upload.png');
  });

  test('direct navigation to session detail without data', async ({ page }) => {
    await page.goto('/session/aaaaaaaaa');
    await page.waitForTimeout(3000);

    await expect(page).toHaveScreenshot('error-session-not-found.png', {
      mask: [page.locator('.app-header')],
    });
  });
});
