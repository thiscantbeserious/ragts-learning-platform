#!/usr/bin/env node
/**
 * overflow-audit.mjs — Detect horizontal overflow
 *
 * Launches a headless Chromium browser via Playwright, visits each page at
 * a given viewport width, and reports every DOM element whose bounding rect
 * extends past the viewport edge.
 *
 * Usage:
 *   node agents/scripts/overflow-audit.mjs [options]
 *
 * Options:
 *   --url <base>       Base URL (default: http://localhost:3333)
 *   --width <px>       Viewport width to test (default: 375)
 *   --height <px>      Viewport height (default: 812)
 *   --pages <list>     Comma-separated page paths
 *                       (default: guide/layout.html,guide/components.html,guide/iconography.html)
 *   --threshold <px>   Ignore overflows smaller than this (default: 1)
 *   --json             Output raw JSON instead of formatted text
 *   --help             Show this help
 *
 * Prerequisites:
 *   npm run dev:design   (starts serve on :3333)
 *   npx playwright install chromium
 *
 * Exit codes:
 *   0  No page-level overflow detected
 *   1  Page-level overflow found (document.scrollWidth > viewport)
 *   2  Error (server unreachable, missing dependency, etc.)
 */

import { chromium } from 'playwright';

// ── CLI args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}
const showHelp = args.includes('--help');
const jsonOut = args.includes('--json');
const baseUrl = flag('url', 'http://localhost:3333');
const width = Number(flag('width', '375'));
const height = Number(flag('height', '812'));
const threshold = Number(flag('threshold', '1'));
const pages = flag(
  'pages',
  'guide/layout.html,guide/components.html,guide/iconography.html'
).split(',');

if (showHelp) {
  const lines = (await import('fs')).readFileSync(new URL(import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.startsWith(' *'))
    .map(l => l.replace(/^ \*\s?/, ''));
  console.log(lines.join('\n'));
  process.exit(0);
}

// ── Audit logic ─────────────────────────────────────────────────────
async function auditPage(page, url, viewportWidth, thresh) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
  // Small delay for Vue rendering
  await page.waitForTimeout(500);

  return page.evaluate(({ vw, th }) => {
    const docWidth = document.documentElement.scrollWidth;
    const bodyWidth = document.body.scrollWidth;
    const pageLevelOverflow = docWidth > vw;

    const overflows = [];
    for (const el of document.querySelectorAll('*')) {
      const rect = el.getBoundingClientRect();
      if (rect.right > vw + th && rect.width > 0) {
        const tag = el.tagName.toLowerCase();
        const cls = el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\s+/).join('.')
          : '';
        overflows.push({
          selector: `${tag}${cls}`,
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          overflow: Math.round(rect.right - vw),
        });
      }
    }

    // Deduplicate by selector, keep worst overflow
    const map = new Map();
    for (const o of overflows) {
      if (!map.has(o.selector) || map.get(o.selector).right < o.right) {
        map.set(o.selector, o);
      }
    }

    return {
      docWidth,
      bodyWidth,
      pageLevelOverflow,
      elements: [...map.values()].sort((a, b) => b.right - a.right),
    };
  }, { vw: viewportWidth, th: thresh });
}

// ── Main ────────────────────────────────────────────────────────────
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();

  const results = {};
  let hasPageOverflow = false;

  for (const pagePath of pages) {
    const url = `${baseUrl}/${pagePath}`;
    try {
      const result = await auditPage(page, url, width, threshold);
      results[pagePath] = result;
      if (result.pageLevelOverflow) hasPageOverflow = true;
    } catch (err) {
      results[pagePath] = { error: err.message };
      hasPageOverflow = true; // treat errors as failures
    }
  }

  await browser.close();

  // ── Output ──────────────────────────────────────────────────────
  if (jsonOut) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(`\nOverflow Audit — ${width}×${height} viewport\n${'─'.repeat(50)}`);
    for (const [pagePath, r] of Object.entries(results)) {
      if (r.error) {
        console.log(`\n✗ ${pagePath}  ERROR: ${r.error}`);
        continue;
      }
      const status = r.pageLevelOverflow ? '✗' : '✓';
      const note = r.pageLevelOverflow
        ? `PAGE OVERFLOWS (scrollWidth: ${r.docWidth})`
        : 'OK';
      console.log(`\n${status} ${pagePath}  ${note}`);

      if (r.elements.length === 0) {
        console.log('  No element overflows detected.');
      } else {
        console.log(`  ${r.elements.length} element(s) extend past ${width}px:`);
        for (const el of r.elements.slice(0, 20)) {
          console.log(`    +${el.overflow}px  ${el.selector}  (right: ${el.right}, width: ${el.width})`);
        }
      }
    }
    console.log(`\n${'─'.repeat(50)}`);
    console.log(hasPageOverflow
      ? '⚠  Page-level overflow detected — horizontal scrollbar will appear.'
      : '✓  No page-level overflow. All contained within scroll wrappers.');
    console.log();
  }

  process.exit(hasPageOverflow ? 1 : 0);
} catch (err) {
  if (browser) await browser.close().catch(() => {});
  console.error(`Error: ${err.message}`);
  process.exit(2);
}
