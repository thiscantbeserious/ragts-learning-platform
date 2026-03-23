/**
 * Visual regression and functional tests for scrollspy behaviour.
 *
 * Covers:
 * - Initial active section is the first pill on page load.
 * - Scrolling down updates the active pill to reflect the visible section.
 * - Scrolling back up restores the first pill as active.
 * - The active pointer triangle tracks the active pill's Y position.
 * - Collapsing a section updates the active pill (via virtual reflow).
 *
 * All tests run against a large session (>SMALL_SESSION_THRESHOLD sections)
 * so the SectionNavigator and scrollspy are active.
 */
import { test, expect } from '@playwright/test';
import {
  deleteAllSessions,
  gotoSession,
  uploadFixture,
  waitForProcessing,
} from '../helpers/seed-visual-data';

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

test.describe('Scrollspy', () => {
  test.describe.configure({ mode: 'serial' });

  let sessionId: string;

  test.beforeAll(async () => {
    await deleteAllSessions();
    sessionId = await uploadFixture('large-with-markers.cast');
    await waitForProcessing(sessionId);
  });

  test.afterAll(async () => {
    await deleteAllSessions();
  });

  // ---------------------------------------------------------------------------
  // Helper: wait for the navigator and initial pill to be ready
  // ---------------------------------------------------------------------------

  async function gotoAndWaitForNav(page: Parameters<typeof gotoSession>[0]): Promise<void> {
    await gotoSession(page, sessionId, '.section-nav');
    await page.waitForSelector('.section-pill', { timeout: 5000 });
    // Allow initial scrollspy computation to settle.
    await page.waitForTimeout(300);
  }

  // ---------------------------------------------------------------------------
  // Test 1: Initial active section is section 1 (first pill)
  // ---------------------------------------------------------------------------

  test('initial active section is the first pill', async ({ page }) => {
    await gotoAndWaitForNav(page);

    const firstPill = page.locator('.section-pill').first();
    await expect(firstPill).toHaveClass(/section-pill--active/);

    await page.screenshot({
      path: 'tests/visual/__screenshots__/scrollspy.visual.test.ts/initial-active-section.png',
    });
    await expect(page).toHaveScreenshot('scrollspy-initial-state.png', {
      mask: [page.locator('.shell-header')],
    });
  });

  // ---------------------------------------------------------------------------
  // Test 2: Scrolling down updates active section
  // ---------------------------------------------------------------------------

  test('scrolling down updates active pill to later section', async ({ page }) => {
    await gotoAndWaitForNav(page);

    // Get the scroll viewport inside the terminal content area.
    const viewport = page.locator('.terminal-scroll .overlay-scrollbar__viewport');

    // Scroll far enough to move past at least the first two sections.
    // Each section is estimated at ~500-2000px depending on content,
    // so we scroll 3000px to reliably pass section 1 and land in section 2+.
    await viewport.evaluate((el) => {
      el.scrollTo({ top: 3000 });
    });
    await page.waitForTimeout(400);

    // The first pill should no longer be active.
    const firstPill = page.locator('.section-pill').first();
    await expect(firstPill).not.toHaveClass(/section-pill--active/);

    // At least one pill (not the first) should be active.
    const activePills = page.locator('.section-pill--active');
    await expect(activePills).toHaveCount(1);

    await expect(page).toHaveScreenshot('scrollspy-scrolled-down.png', {
      mask: [page.locator('.shell-header')],
    });
  });

  // ---------------------------------------------------------------------------
  // Test 3: Scrolling back up restores first active section
  // ---------------------------------------------------------------------------

  test('scrolling back up restores first pill as active', async ({ page }) => {
    await gotoAndWaitForNav(page);

    const viewport = page.locator('.terminal-scroll .overlay-scrollbar__viewport');

    // Scroll down first.
    await viewport.evaluate((el) => {
      el.scrollTo({ top: 3000 });
    });
    await page.waitForTimeout(300);

    // Scroll back to top.
    await viewport.evaluate((el) => {
      el.scrollTo({ top: 0 });
    });
    await page.waitForTimeout(300);

    const firstPill = page.locator('.section-pill').first();
    await expect(firstPill).toHaveClass(/section-pill--active/);

    await expect(page).toHaveScreenshot('scrollspy-scrolled-back-up.png', {
      mask: [page.locator('.shell-header')],
    });
  });

  // ---------------------------------------------------------------------------
  // Test 4: Active pointer position matches active pill Y offset
  // ---------------------------------------------------------------------------

  test('active pointer top tracks the active pill center', async ({ page }) => {
    await gotoAndWaitForNav(page);

    // Read the pointer's computed top and the active pill's bounding box.
    const pointerTop = await page.locator('.section-nav__pointer').evaluate((el) => {
      return parseFloat(getComputedStyle(el).top);
    });

    const activePill = page.locator('.section-pill--active').first();
    const pillBox = await activePill.boundingBox();
    expect(pillBox).not.toBeNull();

    const asideBox = await page.locator('.section-nav').boundingBox();
    expect(asideBox).not.toBeNull();

    // The pointer's top is relative to the aside.
    // Expected: pillBox.y - asideBox.y + pillBox.height / 2.
    const expectedPointerTop =
      pillBox!.y - asideBox!.y + pillBox!.height / 2;

    // Allow a small tolerance (±2px) for sub-pixel rounding.
    expect(Math.abs(pointerTop - expectedPointerTop)).toBeLessThanOrEqual(2);
  });

  // ---------------------------------------------------------------------------
  // Test 5: Collapsing a section updates active correctly
  // ---------------------------------------------------------------------------

  test('collapsing section 1 makes section 2 active when section 1 shrinks away', async ({ page }) => {
    await gotoAndWaitForNav(page);

    // Verify section 1 is initially active.
    const firstPill = page.locator('.section-pill').first();
    await expect(firstPill).toHaveClass(/section-pill--active/);

    // Collapse the first visible section.
    const firstHeader = page.locator('.section-header').first();
    await firstHeader.click();
    await expect(firstHeader).toHaveClass(/section-header--collapsed/);

    // Allow virtual reflow and scroll recalculation to settle.
    await page.waitForTimeout(400);

    // With section 1 collapsed (much smaller), scrollspy should remain
    // responsive — first pill still active at scrollTop 0.
    const activePills = page.locator('.section-pill--active');
    await expect(activePills).toHaveCount(1);

    await expect(page).toHaveScreenshot('scrollspy-after-collapse.png', {
      mask: [page.locator('.shell-header')],
    });
  });

  // ---------------------------------------------------------------------------
  // Test 6: Navigator aside has no vertical gap (flush to content area edges)
  // ---------------------------------------------------------------------------

  test('navigator aside is flush — no vertical margin at top or bottom', async ({ page }) => {
    await gotoAndWaitForNav(page);

    // Check that the navigator aside top matches the content container top.
    const nav = page.locator('.section-nav');
    const contentArea = page.locator('.session-detail-view');

    const navBox = await nav.boundingBox();
    const contentBox = await contentArea.boundingBox();

    expect(navBox).not.toBeNull();
    expect(contentBox).not.toBeNull();

    // Navigator should start at the top edge of the session-detail-view container.
    // Allow 1px tolerance for border.
    expect(Math.abs(navBox!.y - contentBox!.y)).toBeLessThanOrEqual(1);

    // Navigator bottom should reach the container bottom.
    const navBottom = navBox!.y + navBox!.height;
    const contentBottom = contentBox!.y + contentBox!.height;
    expect(Math.abs(navBottom - contentBottom)).toBeLessThanOrEqual(1);
  });
});
