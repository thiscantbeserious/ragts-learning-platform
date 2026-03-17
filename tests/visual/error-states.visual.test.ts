/**
 * Visual regression tests for error states.
 * Covers 404, network errors, empty sessions, and invalid uploads.
 *
 * Each test is self-contained — no shared state between tests.
 */
import { test, expect } from '@playwright/test';
import { deleteAllSessions } from '../helpers/seed-visual-data';

test('error: 404 — invalid session ID', async ({ page }) => {
  await page.goto('/session/invalid-session-id-does-not-exist');
  await page.waitForSelector('.session-detail-view__state--error', { timeout: 10000 });

  await expect(page).toHaveScreenshot('error-404-invalid-session.png', {
    mask: [page.locator('.shell-header')],
  });
});

test('error: nonexistent route', async ({ page }) => {
  await page.goto('/nonexistent-route');
  await page.waitForLoadState('load');

  await expect(page).toHaveScreenshot('error-nonexistent-route.png', {
    mask: [page.locator('.shell-header')],
  });
});

test('error: empty session list — prompt to upload', async ({ page }) => {
  await deleteAllSessions();

  await page.goto('/');
  await page.waitForSelector('.start-page .upload-zone', { timeout: 10000 });

  const uploadZone = page.locator('.start-page .upload-zone');
  await expect(uploadZone).toBeVisible();
  await expect(uploadZone).toHaveScreenshot('error-empty-session-list.png');
});

test('error: upload of non-.cast file shows error', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.start-page__file-input', { timeout: 10000 });

  const fileInput = page.locator('.start-page__file-input');
  await fileInput.setInputFiles({
    name: 'invalid.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('This is not a cast file'),
  });

  // Wait briefly for any error state to appear in the sidebar
  await page.waitForTimeout(1000);
  await expect(page.locator('.spatial-shell__main')).toHaveScreenshot('error-invalid-file-upload.png');
});

test('error: direct navigation to session detail without data', async ({ page }) => {
  await page.goto('/session/aaaaaaaaa');
  await page.waitForSelector('.session-detail-view__state--error', { timeout: 10000 });

  await expect(page).toHaveScreenshot('error-session-not-found.png', {
    mask: [page.locator('.shell-header')],
  });
});
