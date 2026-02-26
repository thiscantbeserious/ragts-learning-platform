/**
 * Visual regression tests for terminal rendering.
 * Covers ANSI colors, line numbers, section badges, and terminal chrome.
 */
import { test, expect } from '@playwright/test';
import { uploadFixture, waitForProcessing, deleteAllSessions } from '../helpers/seed-visual-data';

test.describe('Terminal Rendering', () => {
  test.describe.configure({ mode: 'serial' });
  let sessionId: string;

  test.beforeAll(async () => {
    await deleteAllSessions();
    sessionId = await uploadFixture('valid-with-markers.cast');
    await waitForProcessing(sessionId);
  });

  test.afterAll(async () => {
    await deleteAllSessions();
  });

  test('ANSI color rendering in terminal', async ({ page }) => {
    await page.goto(`/session/${sessionId}`);
    await page.waitForSelector('.terminal-span', { timeout: 15000 });

    const coloredSpans = page.locator('.terminal-span[style*="color"]');
    const count = await coloredSpans.count();
    expect(count).toBeGreaterThan(0);

    await expect(page.locator('.terminal-chrome')).toHaveScreenshot('terminal-ansi-colors.png');
  });

  test('line numbers aligned', async ({ page }) => {
    await page.goto(`/session/${sessionId}`);
    await page.waitForSelector('.terminal-line__number', { timeout: 15000 });

    const numbers = page.locator('.terminal-line__number');
    const count = await numbers.count();
    expect(count).toBeGreaterThan(0);

    const firstLine = page.locator('.terminal-line').first();
    await expect(firstLine).toHaveScreenshot('terminal-line-number-alignment.png');
  });

  test('section header marker badge', async ({ page }) => {
    await page.goto(`/session/${sessionId}`);
    await page.waitForSelector('.section-header__badge', { timeout: 15000 });

    const markerBadges = page.locator('.section-header__badge');
    const count = await markerBadges.count();
    expect(count).toBeGreaterThan(0);

    await expect(markerBadges.first()).toHaveScreenshot('terminal-marker-badge.png');
  });

  test('terminal content whitespace preserved', async ({ page }) => {
    await page.goto(`/session/${sessionId}`);
    await page.waitForSelector('.terminal-line__content', { timeout: 15000 });

    const content = page.locator('.terminal-line__content').first();
    const style = await content.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { whiteSpace: cs.whiteSpace };
    });
    expect(style.whiteSpace).toBe('pre');
  });

  test('empty terminal state message', async ({ page }) => {
    await page.goto('/session/nonexistent-id-12345');
    await page.waitForTimeout(3000);

    await expect(page).toHaveScreenshot('terminal-error-state.png', {
      mask: [page.locator('.app-header')],
    });
  });

  test('terminal chrome border and background', async ({ page }) => {
    await page.goto(`/session/${sessionId}`);
    await page.waitForSelector('.terminal-chrome', { timeout: 15000 });

    const chrome = page.locator('.terminal-chrome');
    const styles = await chrome.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        background: cs.backgroundColor,
        borderRadius: cs.borderRadius,
        overflow: cs.overflow,
      };
    });

    expect(styles.borderRadius).toBe('8px');
    expect(styles.overflow).toBe('hidden');
    await expect(chrome).toHaveScreenshot('terminal-chrome-styles.png');
  });

  test('section header label and chevron', async ({ page }) => {
    await page.goto(`/session/${sessionId}`);
    await page.waitForSelector('.section-header', { timeout: 15000 });

    const header = page.locator('.section-header').first();
    const chevron = header.locator('.section-header__chevron');
    const label = header.locator('.section-header__label');

    expect(await chevron.textContent()).toBeTruthy();
    expect(await label.textContent()).toBeTruthy();

    await expect(header).toHaveScreenshot('section-header-with-label.png');
  });

  test('multiple sections with different content', async ({ page }) => {
    await page.goto(`/session/${sessionId}`);
    await page.waitForSelector('.section-header', { timeout: 15000 });

    const headers = page.locator('.section-header');
    const count = await headers.count();
    expect(count).toBeGreaterThan(1);

    await expect(page.locator('.terminal-chrome')).toHaveScreenshot('terminal-multiple-sections.png');
  });
});
