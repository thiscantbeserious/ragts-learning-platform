/**
 * Visual regression tests for terminal rendering.
 * Covers ANSI colors, line numbers, section badges, and terminal chrome.
 */
import { test, expect, type Page } from '@playwright/test';
import { uploadFixture, waitForProcessing, deleteAllSessions } from '../helpers/seed-visual-data';

/** Navigate to the session detail page and wait for a selector to appear. */
async function gotoSession(page: Page, id: string, waitFor: string) {
  await page.goto(`/session/${id}`);
  await page.waitForSelector(waitFor, { timeout: 15000 });
}

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
    await gotoSession(page, sessionId, '.terminal-span');

    const coloredSpans = page.locator('.terminal-span[style*="color"]');
    const count = await coloredSpans.count();
    expect(count).toBeGreaterThan(0);

    await expect(page.locator('.terminal-chrome')).toHaveScreenshot('terminal-ansi-colors.png');
  });

  test('line numbers aligned', async ({ page }) => {
    await gotoSession(page, sessionId, '.terminal-line__number');

    const numbers = page.locator('.terminal-line__number');
    const count = await numbers.count();
    expect(count).toBeGreaterThan(0);

    const firstLine = page.locator('.terminal-line').first();
    await expect(firstLine).toHaveScreenshot('terminal-line-number-alignment.png');
  });

  test('section header marker badge', async ({ page }) => {
    await gotoSession(page, sessionId, '.section-header__badge');

    const markerBadges = page.locator('.section-header__badge');
    const count = await markerBadges.count();
    expect(count).toBeGreaterThan(0);

    await expect(markerBadges.first()).toHaveScreenshot('terminal-marker-badge.png');
  });

  test('terminal content whitespace preserved', async ({ page }) => {
    await gotoSession(page, sessionId, '.terminal-line__content');

    const content = page.locator('.terminal-line__content').first();
    const style = await content.evaluate((el) => {
      const cs = globalThis.getComputedStyle(el);
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
    await gotoSession(page, sessionId, '.terminal-chrome');

    const chrome = page.locator('.terminal-chrome');
    const styles = await chrome.evaluate((el) => {
      const cs = globalThis.getComputedStyle(el);
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
    await gotoSession(page, sessionId, '.section-header');

    const header = page.locator('.section-header').first();
    const chevron = header.locator('.section-header__chevron');
    const label = header.locator('.section-header__label');

    expect(await chevron.textContent()).toBeTruthy();
    expect(await label.textContent()).toBeTruthy();

    await expect(header).toHaveScreenshot('section-header-with-label.png');
  });

  test('multiple sections with different content', async ({ page }) => {
    await gotoSession(page, sessionId, '.section-header');

    const headers = page.locator('.section-header');
    const count = await headers.count();
    expect(count).toBeGreaterThan(1);

    await expect(page.locator('.terminal-chrome')).toHaveScreenshot('terminal-multiple-sections.png');
  });
});
