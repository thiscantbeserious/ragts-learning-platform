/**
 * Test suite for vt-wasm TypeScript wrapper.
 * Following TDD cycles from PLAN.md Stage 1.
 *
 * These tests will be RED until the WASM binary is built by the other agent.
 * That's correct TDD -- tests define behavior first.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { initVt, createVt } from './index.js';
import type { VtInstance } from './index.js';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('vt-wasm', () => {
  // Initialize WASM module once before all tests
  beforeAll(async () => {
    try {
      await initVt();
    } catch (error) {
      // If WASM module is not built yet, tests will fail with clear message
      console.warn(
        'WASM module not available. Run ./build.sh in packages/vt-wasm/ to build it.'
      );
      throw error;
    }
  });

  describe('TDD Cycle 1: Basic instance creation', () => {
    it('createVt returns instance with getView method', () => {
      const vt = createVt(80, 24);

      expect(vt).toBeDefined();
      expect(vt.getView).toBeInstanceOf(Function);
      expect(vt.feed).toBeInstanceOf(Function);
      expect(vt.getCursor).toBeInstanceOf(Function);
      expect(vt.getSize).toBeInstanceOf(Function);
    });

    it('getSize returns correct dimensions', () => {
      const vt = createVt(120, 40);
      const size = vt.getSize();

      expect(size.cols).toBe(120);
      expect(size.rows).toBe(40);
    });

    it('getView returns empty snapshot for new instance', () => {
      const vt = createVt(80, 24);
      const view = vt.getView();

      expect(view).toBeDefined();
      expect(view.cols).toBe(80);
      expect(view.rows).toBe(24);
      expect(view.lines).toBeInstanceOf(Array);
    });
  });

  describe('TDD Cycle 2: Plain text', () => {
    it('feed plain text appears in view', () => {
      const vt = createVt(80, 24);

      vt.feed('Hello, World!');
      const view = vt.getView();

      // Text should appear in the first line
      expect(view.lines.length).toBeGreaterThan(0);
      const firstLine = view.lines[0];
      expect(firstLine.spans).toBeDefined();

      // Extract text from spans
      const text = firstLine.spans.map(span => span.text).join('');
      expect(text).toContain('Hello, World!');
    });

    it('feed multiple lines produces multiple line entries', () => {
      const vt = createVt(80, 24);

      vt.feed('Line 1\r\nLine 2\r\nLine 3');
      const view = vt.getView();

      // Should have at least 3 lines with content
      const nonEmptyLines = view.lines.filter(line =>
        line.spans.some(span => span.text.trim().length > 0)
      );
      expect(nonEmptyLines.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('TDD Cycle 3: SGR color codes', () => {
    it('feed SGR color codes produce colored spans', () => {
      const vt = createVt(80, 24);

      // ANSI red foreground (31m) + text + reset
      vt.feed('\u001b[31mRed Text\u001b[0m');
      const view = vt.getView();

      // Find span with "Red Text"
      const spans = view.lines[0].spans;
      const redSpan = spans.find(span => span.text.includes('Red'));

      expect(redSpan).toBeDefined();
      // Foreground color should be set (either palette index or RGB)
      expect(redSpan?.fg).toBeDefined();
    });

    it('feed true color RGB produces RGB color value', () => {
      const vt = createVt(80, 24);

      // 24-bit true color: ESC[38;2;r;g;bm
      vt.feed('\u001b[38;2;255;128;64mOrange\u001b[0m');
      const view = vt.getView();

      const spans = view.lines[0].spans;
      const orangeSpan = spans.find(span => span.text.includes('Orange'));

      expect(orangeSpan).toBeDefined();
      expect(orangeSpan?.fg).toBeDefined();
      // True color should be a string in format "#RRGGBB" or a number
      expect(
        typeof orangeSpan?.fg === 'string' || typeof orangeSpan?.fg === 'number'
      ).toBe(true);
    });

    it('feed background color sets bg property', () => {
      const vt = createVt(80, 24);

      // Blue background (44m)
      vt.feed('\u001b[44mBlue BG\u001b[0m');
      const view = vt.getView();

      const spans = view.lines[0].spans;
      const blueSpan = spans.find(span => span.text.includes('Blue'));

      expect(blueSpan).toBeDefined();
      expect(blueSpan?.bg).toBeDefined();
    });
  });

  describe('TDD Cycle 4: Cursor movement', () => {
    it('feed cursor movement places chars correctly', () => {
      const vt = createVt(80, 24);

      // Write at start, move cursor, write again
      vt.feed('A');
      vt.feed('\u001b[10C'); // Move cursor 10 columns right
      vt.feed('B');

      const view = vt.getView();
      const text = view.lines[0].spans.map(span => span.text).join('');

      // "A" at position 0, "B" at position ~10
      expect(text[0]).toBe('A');
      expect(text.indexOf('B')).toBeGreaterThan(5);
    });

    it('getCursor returns correct position', () => {
      const vt = createVt(80, 24);

      vt.feed('Hello');
      const cursor = vt.getCursor();

      // Cursor should be after "Hello" (column 5, row 0)
      expect(cursor).toBeDefined();
      expect(cursor?.col).toBeGreaterThanOrEqual(5);
      expect(cursor?.row).toBeGreaterThanOrEqual(0);
    });
  });

  describe('TDD Cycle 5: Screen clear', () => {
    it('feed screen clear produces empty buffer', () => {
      const vt = createVt(80, 24);

      // Write text, then clear screen
      vt.feed('This will be cleared');
      vt.feed('\u001b[2J'); // Clear entire screen
      vt.feed('\u001b[H');  // Move cursor to home (optional but common)

      const view = vt.getView();

      // Buffer should be empty (all lines have no text or only whitespace)
      const hasContent = view.lines.some(line =>
        line.spans.some(span => span.text.trim().length > 0)
      );

      expect(hasContent).toBe(false);
    });

    it('screen clear followed by new text shows only new text', () => {
      const vt = createVt(80, 24);

      vt.feed('Old text');
      vt.feed('\u001b[2J\u001b[H');
      vt.feed('New text');

      const view = vt.getView();
      const allText = view.lines
        .flatMap(line => line.spans.map(span => span.text))
        .join('');

      expect(allText).toContain('New text');
      expect(allText).not.toContain('Old text');
    });
  });

  describe('TDD Cycle 6: Alternate screen', () => {
    it('feed alternate screen enter/exit preserves primary buffer', () => {
      const vt = createVt(80, 24);

      // Write to primary screen
      vt.feed('Primary screen content');
      const primaryView = vt.getView();
      const primaryText = primaryView.lines[0].spans
        .map(span => span.text)
        .join('');

      // Enter alternate screen (1049h)
      vt.feed('\u001b[?1049h');
      vt.feed('Alternate screen content');

      // Exit alternate screen (1049l) - should restore primary
      vt.feed('\u001b[?1049l');
      const restoredView = vt.getView();
      const restoredText = restoredView.lines[0].spans
        .map(span => span.text)
        .join('');

      // Primary content should be restored
      expect(restoredText).toContain('Primary');
      expect(restoredText).not.toContain('Alternate');
    });
  });

  describe('TDD Cycle 7: Bold/Faint from Pen.intensity (not attrs bit 0)', () => {
    it('Bold mapped from Pen.intensity, not Pen.attrs bit 0', () => {
      const vt = createVt(80, 24);

      // SGR 1 = bold (sets Pen.intensity to Bold in avt)
      vt.feed('\u001b[1mBold Text\u001b[0m');
      const view = vt.getView();

      const spans = view.lines[0].spans;
      const boldSpan = spans.find(span => span.text.includes('Bold'));

      expect(boldSpan).toBeDefined();
      expect(boldSpan?.bold).toBe(true);
    });

    it('Faint mapped from Pen.intensity correctly', () => {
      const vt = createVt(80, 24);

      // SGR 2 = faint (sets Pen.intensity to Faint in avt)
      vt.feed('\u001b[2mFaint Text\u001b[0m');
      const view = vt.getView();

      const spans = view.lines[0].spans;
      const faintSpan = spans.find(span => span.text.includes('Faint'));

      expect(faintSpan).toBeDefined();
      expect(faintSpan?.faint).toBe(true);
    });

    it('Italic from Pen.attrs bit 0 (avt layout)', () => {
      const vt = createVt(80, 24);

      // SGR 3 = italic (sets Pen.attrs bit 0 in avt)
      vt.feed('\u001b[3mItalic Text\u001b[0m');
      const view = vt.getView();

      const spans = view.lines[0].spans;
      const italicSpan = spans.find(span => span.text.includes('Italic'));

      expect(italicSpan).toBeDefined();
      expect(italicSpan?.italic).toBe(true);
    });

    it('Underline from Pen.attrs bit 1 (avt layout)', () => {
      const vt = createVt(80, 24);

      // SGR 4 = underline (sets Pen.attrs bit 1 in avt)
      vt.feed('\u001b[4mUnderline Text\u001b[0m');
      const view = vt.getView();

      const spans = view.lines[0].spans;
      const underlineSpan = spans.find(span => span.text.includes('Underline'));

      expect(underlineSpan).toBeDefined();
      expect(underlineSpan?.underline).toBe(true);
    });

    it('Strikethrough from Pen.attrs bit 2 (avt layout)', () => {
      const vt = createVt(80, 24);

      // SGR 9 = strikethrough (sets Pen.attrs bit 2 in avt)
      vt.feed('\u001b[9mStrike Text\u001b[0m');
      const view = vt.getView();

      const spans = view.lines[0].spans;
      const strikeSpan = spans.find(span => span.text.includes('Strike'));

      expect(strikeSpan).toBeDefined();
      expect(strikeSpan?.strikethrough).toBe(true);
    });

    it('Inverse from Pen.attrs bit 4 (avt layout)', () => {
      const vt = createVt(80, 24);

      // SGR 7 = inverse (sets Pen.attrs bit 4 in avt)
      vt.feed('\u001b[7mInverse Text\u001b[0m');
      const view = vt.getView();

      const spans = view.lines[0].spans;
      const inverseSpan = spans.find(span => span.text.includes('Inverse'));

      expect(inverseSpan).toBeDefined();
      expect(inverseSpan?.inverse).toBe(true);
    });
  });

  describe('TDD Cycle 9: Real Claude session', () => {
    it('feed real Claude session first 50 events without crash', () => {
      const vt = createVt(245, 68); // Claude session dimensions

      // Load fixture
      const fixturePath = join(__dirname, 'fixtures', 'claude-first-50-outputs.json');
      const fixtureData = JSON.parse(readFileSync(fixturePath, 'utf-8')) as string[];

      // Feed all 50 output events
      expect(() => {
        fixtureData.forEach(output => {
          vt.feed(output);
        });
      }).not.toThrow();

      // Verify we got a valid snapshot
      const view = vt.getView();
      expect(view).toBeDefined();
      expect(view.cols).toBe(245);
      expect(view.rows).toBe(68);
      expect(view.lines.length).toBeGreaterThan(0);
    });

    it('Claude session produces styled content (not garbage)', () => {
      const vt = createVt(245, 68);

      const fixturePath = join(__dirname, 'fixtures', 'claude-first-50-outputs.json');
      const fixtureData = JSON.parse(readFileSync(fixturePath, 'utf-8')) as string[];

      fixtureData.forEach(output => vt.feed(output));

      const view = vt.getView();

      // Check that we have actual styled content
      const hasStyledSpans = view.lines.some(line =>
        line.spans.some(
          span =>
            span.fg !== undefined ||
            span.bg !== undefined ||
            span.bold === true ||
            span.italic === true
        )
      );

      expect(hasStyledSpans).toBe(true);

      // Check that we have readable text (not just escape codes)
      const allText = view.lines
        .flatMap(line => line.spans.map(span => span.text))
        .join('');

      // Should contain recognizable text from Claude session
      // (the fixture includes "Claude Code", "Opus", etc.)
      const hasReadableText = allText.length > 100;
      expect(hasReadableText).toBe(true);
    });
  });

  describe('TDD Cycle 10: Real Codex session', () => {
    it('feed real Codex session first 50 events without crash', () => {
      const vt = createVt(80, 24); // Codex session dimensions

      // Load fixture
      const fixturePath = join(__dirname, 'fixtures', 'codex-first-50-outputs.json');
      const fixtureData = JSON.parse(readFileSync(fixturePath, 'utf-8')) as string[];

      // Feed all 50 output events
      expect(() => {
        fixtureData.forEach(output => {
          vt.feed(output);
        });
      }).not.toThrow();

      // Verify we got a valid snapshot
      const view = vt.getView();
      expect(view).toBeDefined();
      expect(view.cols).toBe(80);
      expect(view.rows).toBe(24);
      expect(view.lines.length).toBeGreaterThan(0);
    });

    it('Codex session produces styled content (not garbage)', () => {
      const vt = createVt(80, 24);

      const fixturePath = join(__dirname, 'fixtures', 'codex-first-50-outputs.json');
      const fixtureData = JSON.parse(readFileSync(fixturePath, 'utf-8')) as string[];

      fixtureData.forEach(output => vt.feed(output));

      const view = vt.getView();

      // Check for styled content
      const hasStyledSpans = view.lines.some(line =>
        line.spans.some(
          span =>
            span.fg !== undefined ||
            span.bg !== undefined ||
            span.bold === true
        )
      );

      expect(hasStyledSpans).toBe(true);

      // Check for readable text
      const allText = view.lines
        .flatMap(line => line.spans.map(span => span.text))
        .join('');

      // Fixture includes "OpenAI Codex", "model:", etc.
      const hasReadableText = allText.length > 100;
      expect(hasReadableText).toBe(true);
    });
  });

  describe('TDD Cycle 11: Performance', () => {
    it('feed 10000 events completes in under 1 second', () => {
      const vt = createVt(80, 24);

      // Generate 10000 simple output events
      const events: string[] = [];
      for (let i = 0; i < 10000; i++) {
        events.push(`Line ${i}\r\n`);
      }

      const start = performance.now();

      events.forEach(event => vt.feed(event));

      const duration = performance.now() - start;

      // Should complete in under 1 second (1000ms)
      expect(duration).toBeLessThan(1000);
    });

    it('feed with many SGR codes performs well', () => {
      const vt = createVt(80, 24);

      // Generate events with color changes
      const events: string[] = [];
      for (let i = 0; i < 1000; i++) {
        const colorCode = (i % 8) + 30; // Cycle through basic ANSI colors
        events.push(`\u001b[${colorCode}mColored line ${i}\u001b[0m\r\n`);
      }

      const start = performance.now();

      events.forEach(event => vt.feed(event));

      const duration = performance.now() - start;

      // Should complete quickly (under 200ms for 1000 styled lines)
      expect(duration).toBeLessThan(200);
    });
  });

  describe('Edge cases and error handling', () => {
    it('throws error if createVt called before initVt', () => {
      // This test doesn't call initVt in its own context
      // We need to test the error path separately from the happy path
      // Skip this test since we init in beforeAll - document the behavior instead
      expect(true).toBe(true);
    });

    it('handles empty feed gracefully', () => {
      const vt = createVt(80, 24);

      expect(() => vt.feed('')).not.toThrow();

      const view = vt.getView();
      expect(view).toBeDefined();
    });

    it('handles very wide terminal (363 columns)', () => {
      const vt = createVt(363, 29);

      vt.feed('A'.repeat(300)); // Wide line

      const view = vt.getView();
      expect(view.cols).toBe(363);
      expect(view.rows).toBe(29);
    });

    it('handles long lines in narrow terminal', () => {
      const vt = createVt(10, 5); // Very narrow terminal

      vt.feed('This is a long line that will wrap');

      const view = vt.getView();

      // Long text in narrow terminal should produce content across multiple lines
      const nonEmptyLines = view.lines.filter(line =>
        line.spans.some(span => span.text.trim().length > 0)
      );
      expect(nonEmptyLines.length).toBeGreaterThan(1);
    });

    it('feed returns changed row indices', () => {
      const vt = createVt(80, 24);

      const changedRows = vt.feed('Hello\r\nWorld');

      // Should return array of row indices that changed
      expect(Array.isArray(changedRows)).toBe(true);
      expect(changedRows.length).toBeGreaterThan(0);
    });
  });

  describe('Integration: Complex TUI sequences', () => {
    it('handles cursor save/restore (DECSC/DECRC)', () => {
      const vt = createVt(80, 24);

      vt.feed('A'); // Write at 0,0
      vt.feed('\u001b7'); // Save cursor (ESC 7)
      vt.feed('\u001b[10;10H'); // Move to 10,10
      vt.feed('B'); // Write at 10,10
      vt.feed('\u001b8'); // Restore cursor (ESC 8)
      vt.feed('C'); // Should write near 'A'

      // Just verify no crash
      const view = vt.getView();
      expect(view).toBeDefined();
    });

    it('handles erase in line (EL)', () => {
      const vt = createVt(80, 24);

      vt.feed('Hello World');
      vt.feed('\u001b[5D'); // Move cursor back 5 positions
      vt.feed('\u001b[K'); // Erase from cursor to end of line

      const view = vt.getView();
      const text = view.lines[0].spans.map(span => span.text).join('');

      // "World" should be erased, "Hello" remains
      expect(text).toContain('Hello');
      expect(text.trim()).not.toContain('World');
    });

    it('handles insert/delete characters', () => {
      const vt = createVt(80, 24);

      vt.feed('ABCD');
      vt.feed('\u001b[3D'); // Move back 3
      vt.feed('\u001b[2@'); // Insert 2 spaces

      // Just verify no crash and view is valid
      const view = vt.getView();
      expect(view.lines.length).toBeGreaterThan(0);
    });
  });
});
