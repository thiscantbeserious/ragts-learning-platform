// @vitest-environment node
/**
 * Stage 2: CSS Grid Shell — structural verification tests.
 *
 * Verifies that index.html and main.ts are updated correctly per the
 * ADR D2 decision: layout.css and shell.css are blocking <link> tags
 * loaded before the script tag.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');

function readRoot(file: string): string {
  return readFileSync(resolve(ROOT, file), 'utf-8');
}

describe('index.html structural requirements', () => {
  let html: string;

  beforeEach(() => {
    html = readRoot('index.html');
  });

  it('has title set to "Erika"', () => {
    expect(html).toContain('<title>Erika</title>');
  });

  it('contains a blocking <link> for layout.css', () => {
    expect(html).toMatch(/href="\/design\/styles\/layout\.css"/);
  });

  it('contains a blocking <link> for shell.css', () => {
    expect(html).toMatch(/href="\/design\/styles\/shell\.css"/);
  });

  it('loads layout.css before shell.css', () => {
    const layoutPos = html.indexOf('layout.css');
    const shellPos = html.indexOf('shell.css');
    expect(layoutPos).toBeGreaterThan(-1);
    expect(shellPos).toBeGreaterThan(-1);
    expect(layoutPos).toBeLessThan(shellPos);
  });

  it('loads both CSS links before the script tag', () => {
    const layoutPos = html.indexOf('layout.css');
    const shellPos = html.indexOf('shell.css');
    const scriptPos = html.indexOf('<script');
    expect(layoutPos).toBeLessThan(scriptPos);
    expect(shellPos).toBeLessThan(scriptPos);
  });

  it('has .spatial-shell class on #app div', () => {
    expect(html).toMatch(/id="app"[^>]*class="spatial-shell"|class="spatial-shell"[^>]*id="app"/);
  });
});

describe('main.ts does not import layout.css', () => {
  it('does not contain an import statement for layout.css', () => {
    const mainTs = readRoot('src/client/main.ts');
    // Comments may reference layout.css for developer context — only import() and import statements are forbidden.
    expect(mainTs).not.toMatch(/^import\s+['"].*layout\.css['"]/m);
  });
});

describe('shell.css structural requirements', () => {
  let css: string;

  beforeEach(() => {
    css = readRoot('design/styles/shell.css');
  });

  it('defines .spatial-shell with display: grid', () => {
    expect(css).toContain('display: grid');
  });

  it('defines all six grid-template-areas', () => {
    expect(css).toContain('brand');
    expect(css).toContain('header');
    expect(css).toContain('sidebar');
    expect(css).toContain('main');
    expect(css).toContain('aside');
    expect(css).toContain('bottom');
  });

  it('uses --sidebar-width token for column sizing', () => {
    expect(css).toContain('--sidebar-width');
  });

  it('uses --header-height token for row sizing', () => {
    expect(css).toContain('--header-height');
  });

  it('defines grid area class for .spatial-shell__brand', () => {
    expect(css).toContain('.spatial-shell__brand');
  });

  it('defines grid area class for .spatial-shell__header', () => {
    expect(css).toContain('.spatial-shell__header');
  });

  it('defines grid area class for .spatial-shell__sidebar', () => {
    expect(css).toContain('.spatial-shell__sidebar');
  });

  it('defines grid area class for .spatial-shell__main', () => {
    expect(css).toContain('.spatial-shell__main');
  });

  it('defines grid area class for .spatial-shell__aside', () => {
    expect(css).toContain('.spatial-shell__aside');
  });

  it('defines grid area class for .spatial-shell__bottom', () => {
    expect(css).toContain('.spatial-shell__bottom');
  });

  it('has a responsive rule for max-width 767px', () => {
    expect(css).toContain('@media');
    expect(css).toContain('767px');
  });

  it('has transition on grid-template-columns for panel animation', () => {
    expect(css).toMatch(/transition:\s*grid-template-columns/);
  });

  it('does not use repeat() in the grid-template-columns value (interpolation bug prevention)', () => {
    // Extract the actual grid-template-columns property value lines (not comments).
    // CSS property lines start with optional whitespace then the property name.
    const lines = css.split('\n');
    const templateColumnsLines = lines.filter(
      (l) => /^\s+grid-template-columns\s*:/.test(l)
    );
    expect(templateColumnsLines.length).toBeGreaterThan(0);
    for (const line of templateColumnsLines) {
      expect(line).not.toContain('repeat(');
    }
  });
});

describe('layout.css has --sidebar-width token', () => {
  it('contains --sidebar-width: 260px', () => {
    const layoutCss = readRoot('design/styles/layout.css');
    expect(layoutCss).toContain('--sidebar-width: 260px');
  });
});
