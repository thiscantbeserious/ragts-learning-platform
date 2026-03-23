/**
 * Visual regression tests for virtual scrolling integration in session content.
 *
 * Covers:
 * - Correct terminal-chrome structure
 * - Section collapse reflows other sections (Y-position shift)
 * - Scroll functionality
 * - Navigator visible for large sessions (>SMALL_SESSION_THRESHOLD sections)
 * - Navigator hidden for small sessions
 */
import { test, expect } from '@playwright/test';
import {
  seedSessionFixture,
  deleteAllSessions,
  gotoSession,
  uploadFixture,
  waitForProcessing,
} from '../helpers/seed-visual-data';

// ---------------------------------------------------------------------------
// Small session suite (3 sections — below threshold of 5)
// ---------------------------------------------------------------------------

test.describe('Small session (no navigator)', () => {
  test.describe.configure({ mode: 'serial' });
  let smallSessionId: string;

  test.beforeAll(async () => {
    smallSessionId = await seedSessionFixture('valid-with-markers.cast');
  });

  test.afterAll(async () => {
    await deleteAllSessions();
  });

  test('terminal-chrome > overlay-scrollbar > section-item structure exists', async ({ page }) => {
    await gotoSession(page, smallSessionId, '.terminal-chrome');
    await page.waitForSelector('.section-item', { timeout: 5000 });

    expect(await page.locator('.terminal-chrome').count()).toBe(1);
    expect(await page.locator('.overlay-scrollbar').count()).toBeGreaterThan(0);
    expect(await page.locator('.section-item').count()).toBeGreaterThan(0);
  });

  test('navigator is hidden for small session', async ({ page }) => {
    await gotoSession(page, smallSessionId, '.terminal-chrome');

    const nav = page.locator('.section-nav');
    await expect(nav).toHaveCount(0);
  });

  test('section collapse reflows — next section moves up', async ({ page }) => {
    await gotoSession(page, smallSessionId, '.section-header');
    await page.waitForSelector('.section-item', { timeout: 5000 });

    const headers = page.locator('.section-header');
    const sectionItems = page.locator('.section-item');

    // Wait for content to load (sections render async)
    await page.waitForTimeout(500);

    const secondItemBefore = await sectionItems.nth(1).boundingBox();
    expect(secondItemBefore).not.toBeNull();

    // Collapse the first section
    await headers.first().click();
    await expect(headers.first()).toHaveClass(/section-header--collapsed/);

    // Allow layout to reflow
    await page.waitForTimeout(200);

    const secondItemAfter = await sectionItems.nth(1).boundingBox();
    expect(secondItemAfter).not.toBeNull();

    // Second section should have moved up (smaller Y)
    expect(secondItemAfter!.y).toBeLessThan(secondItemBefore!.y);
  });

  test('scroll works for small session', async ({ page }) => {
    await gotoSession(page, smallSessionId, '.terminal-line');

    const scrollable = page.locator('.session-detail-view');
    const initialScrollY = await scrollable.evaluate((el) => el.scrollTop);

    // Scroll down
    await scrollable.evaluate((el) => el.scrollTo({ top: 100 }));
    await page.waitForTimeout(100);

    const afterScrollY = await scrollable.evaluate((el) => el.scrollTop);
    expect(afterScrollY).toBeGreaterThan(initialScrollY);
  });

  test('screenshot — small session full layout', async ({ page }) => {
    await gotoSession(page, smallSessionId, '.section-item');
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('session-content-small-session.png', {
      mask: [page.locator('.shell-header')],
    });
  });
});

// ---------------------------------------------------------------------------
// Large session suite (6 sections — above threshold of 5)
// ---------------------------------------------------------------------------

test.describe('Large session (with navigator)', () => {
  test.describe.configure({ mode: 'serial' });
  let largeSessionId: string;

  test.beforeAll(async () => {
    await deleteAllSessions();
    largeSessionId = await uploadFixture('large-with-markers.cast');
    await waitForProcessing(largeSessionId);
  });

  test.afterAll(async () => {
    await deleteAllSessions();
  });

  test('navigator visible for large session', async ({ page }) => {
    await gotoSession(page, largeSessionId, '.terminal-chrome');
    await page.waitForSelector('.section-nav', { timeout: 5000 });

    expect(await page.locator('.section-nav').count()).toBeGreaterThan(0);
  });

  test('virtual items render in positioned container', async ({ page }) => {
    await gotoSession(page, largeSessionId, '.section-virtual-container');

    const container = page.locator('.section-virtual-container');
    await expect(container).toBeVisible();

    // Container should have a height style (set by virtualizer totalHeight)
    const style = await container.getAttribute('style');
    expect(style).toMatch(/height:\s*\d+px/);
  });

  test('section collapse reflows in virtual mode', async ({ page }) => {
    await gotoSession(page, largeSessionId, '.section-header');
    await page.waitForSelector('.section-item', { timeout: 5000 });
    await page.waitForTimeout(500);

    const headers = page.locator('.section-header');
    const sectionItems = page.locator('.section-item');

    const secondItemBefore = await sectionItems.nth(1).boundingBox();
    expect(secondItemBefore).not.toBeNull();

    await headers.first().click();
    await expect(headers.first()).toHaveClass(/section-header--collapsed/);

    // Virtual mode uses ResizeObserver — allow time for reflow
    await page.waitForTimeout(400);

    const secondItemAfter = await sectionItems.nth(1).boundingBox();
    expect(secondItemAfter).not.toBeNull();

    expect(secondItemAfter!.y).toBeLessThan(secondItemBefore!.y);
  });

  test('screenshot — large session with navigator', async ({ page }) => {
    await gotoSession(page, largeSessionId, '.section-nav');
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('session-content-large-session.png', {
      mask: [page.locator('.shell-header')],
    });
  });
});
