/**
 * Visual regression tests for the session detail page.
 * Covers loading, content display, section fold/unfold, and navigation.
 */
import { test, expect } from '@playwright/test';
import { seedSessionFixture, deleteAllSessions, gotoSession } from '../helpers/seed-visual-data';

test.describe('Session Detail Page', () => {
  test.describe.configure({ mode: 'serial' });
  let sessionId: string;

  test.beforeAll(async () => {
    sessionId = await seedSessionFixture();
  });

  test.afterAll(async () => {
    await deleteAllSessions();
  });

  test('loaded with terminal content and sections', async ({ page }) => {
    await gotoSession(page, sessionId, '.terminal-chrome');
    await page.waitForSelector('.section-header', { timeout: 5000 });

    await expect(page).toHaveScreenshot('session-detail-loaded.png', {
      mask: [page.locator('.app-header')],
    });
  });

  test('section headers visible', async ({ page }) => {
    await gotoSession(page, sessionId, '.section-header');

    const headers = page.locator('.section-header');
    const count = await headers.count();
    expect(count).toBeGreaterThan(0);

    await expect(headers.first()).toHaveScreenshot('section-header-first.png');
  });

  test('section collapsed after click', async ({ page }) => {
    await gotoSession(page, sessionId, '.section-header');

    const firstHeader = page.locator('.section-header').first();
    await firstHeader.click();

    await expect(firstHeader).toHaveClass(/section-header--collapsed/);
    await expect(page).toHaveScreenshot('session-detail-section-collapsed.png', {
      mask: [page.locator('.app-header')],
    });
  });

  test('section expanded after double click (toggle)', async ({ page }) => {
    await gotoSession(page, sessionId, '.section-header');

    const firstHeader = page.locator('.section-header').first();
    await firstHeader.click();
    await expect(firstHeader).toHaveClass(/section-header--collapsed/);
    await firstHeader.click();
    await expect(firstHeader).not.toHaveClass(/section-header--collapsed/);

    await expect(page).toHaveScreenshot('session-detail-section-expanded.png', {
      mask: [page.locator('.app-header')],
    });
  });

  test('back navigation link', async ({ page }) => {
    await gotoSession(page, sessionId, '.terminal-chrome');

    const backLink = page.locator('a[href="/"]').first();
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveScreenshot('session-detail-back-link.png');
  });

  test('terminal content with line numbers', async ({ page }) => {
    await gotoSession(page, sessionId, '.terminal-line');

    const lineNumbers = page.locator('.terminal-line__number');
    const count = await lineNumbers.count();
    expect(count).toBeGreaterThan(0);

    await expect(page.locator('.terminal-chrome')).toHaveScreenshot('session-detail-terminal-chrome.png');
  });

  test('section badge types visible', async ({ page }) => {
    await gotoSession(page, sessionId, '.section-header__badge');

    const badges = page.locator('.section-header__badge');
    const count = await badges.count();
    expect(count).toBeGreaterThan(0);

    await expect(badges.first()).toHaveScreenshot('section-badge.png');
  });

  test('section meta line range info', async ({ page }) => {
    await gotoSession(page, sessionId, '.section-header__meta');

    const meta = page.locator('.section-header__meta');
    await expect(meta.first()).toBeVisible();
    await expect(meta.first()).toHaveScreenshot('section-meta-lines.png');
  });

  test('full page layout at viewport', async ({ page }) => {
    await gotoSession(page, sessionId, '.terminal-chrome');

    await expect(page).toHaveScreenshot('session-detail-full-layout.png', {
      fullPage: true,
      mask: [page.locator('.app-header')],
    });
  });

  test('marker section label visible', async ({ page }) => {
    await gotoSession(page, sessionId, '.section-header__label');

    const labels = page.locator('.section-header__label');
    const count = await labels.count();
    expect(count).toBeGreaterThan(0);
    const firstLabel = await labels.first().textContent();
    expect(firstLabel).toBeTruthy();
  });
});
