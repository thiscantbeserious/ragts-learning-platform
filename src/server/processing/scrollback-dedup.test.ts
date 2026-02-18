/**
 * Tests for scrollback deduplication module.
 * TUI applications (Claude Code, Gemini CLI) perform clear-screen + redraw cycles,
 * causing massive duplication in scrollback. This module deduplicates it.
 */

import { describe, it, expect } from 'vitest';
import { buildCleanDocument } from './scrollback-dedup.js';
import type { TerminalSnapshot, SnapshotLine } from '../../../packages/vt-wasm/types.js';

/**
 * Helper to create a SnapshotLine from plain text.
 */
function makeLine(text: string): SnapshotLine {
  return { spans: [{ text }] };
}

/**
 * Helper to create a TerminalSnapshot from plain text lines.
 */
function makeSnapshot(texts: string[]): TerminalSnapshot {
  return { cols: 80, rows: 24, lines: texts.map(makeLine) };
}

describe('buildCleanDocument', () => {
  describe('zero epochs (identity transform)', () => {
    it('returns unchanged snapshot when no epoch boundaries', () => {
      const raw = makeSnapshot(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
      const result = buildCleanDocument(raw, []);

      expect(result.cleanSnapshot.lines.length).toBe(10);
      expect(result.cleanSnapshot.lines[0].spans[0].text).toBe('A');
      expect(result.cleanSnapshot.lines[9].spans[0].text).toBe('J');
    });

    it('rawToClean maps are identity when no epochs', () => {
      const raw = makeSnapshot(['A', 'B', 'C', 'D', 'E']);
      const result = buildCleanDocument(raw, []);

      for (let i = 0; i < 5; i++) {
        expect(result.rawToClean(i)).toBe(i);
      }
    });
  });

  describe('3 epochs with progressive re-renders', () => {
    it('deduplicates when epochs re-render previous content as prefix', () => {
      // Epoch 0: A, B, C (lines 0-2)
      // Epoch 1: A, B, C, D, E (lines 3-7, re-renders A,B,C then adds D,E)
      // Epoch 2: A, B, C, D, E, F, G (lines 8-14, re-renders all then adds F,G)
      //
      // Epoch 1: A,B,C match clean 0-2 (block of 3) → dedup. D,E new.
      // Epoch 2: A,B,C,D,E match clean 0-4 (block of 5) → dedup. F,G new.
      // Expected clean: A, B, C, D, E, F, G (7 lines)
      const raw = makeSnapshot([
        'A', 'B', 'C',           // Epoch 0
        'A', 'B', 'C', 'D', 'E', // Epoch 1
        'A', 'B', 'C', 'D', 'E', 'F', 'G', // Epoch 2
      ]);

      const epochs = [
        { eventIndex: 10, rawLineCount: 3 },
        { eventIndex: 20, rawLineCount: 8 },
      ];

      const result = buildCleanDocument(raw, epochs);

      expect(result.cleanSnapshot.lines.length).toBe(7);
      expect(result.cleanSnapshot.lines.map(l => l.spans[0].text)).toEqual([
        'A', 'B', 'C', 'D', 'E', 'F', 'G',
      ]);
    });

    it('maps raw line numbers to clean line numbers correctly', () => {
      const raw = makeSnapshot([
        'A', 'B', 'C',           // Epoch 0: raw 0-2 -> clean 0-2
        'A', 'B', 'C', 'D', 'E', // Epoch 1: raw 3-5 -> clean 0-2 (overlap), 6-7 -> clean 3-4
        'A', 'B', 'C', 'D', 'E', 'F', 'G', // Epoch 2: raw 8-12 -> clean 0-4, 13-14 -> clean 5-6
      ]);

      const epochs = [
        { eventIndex: 10, rawLineCount: 3 },
        { eventIndex: 20, rawLineCount: 8 },
      ];

      const result = buildCleanDocument(raw, epochs);

      // Epoch 0: raw 0-2 -> clean 0-2
      expect(result.rawToClean(0)).toBe(0);
      expect(result.rawToClean(1)).toBe(1);
      expect(result.rawToClean(2)).toBe(2);

      // Epoch 1: raw 3-5 overlap -> clean 0-2, raw 6-7 new -> clean 3-4
      expect(result.rawToClean(3)).toBe(0);
      expect(result.rawToClean(4)).toBe(1);
      expect(result.rawToClean(5)).toBe(2);
      expect(result.rawToClean(6)).toBe(3);
      expect(result.rawToClean(7)).toBe(4);

      // Epoch 2: raw 8-12 overlap -> clean 0-4, raw 13-14 new -> clean 5-6
      expect(result.rawToClean(8)).toBe(0);
      expect(result.rawToClean(12)).toBe(4);
      expect(result.rawToClean(13)).toBe(5);
      expect(result.rawToClean(14)).toBe(6);
    });
  });

  describe('empty epochs (back-to-back clears)', () => {
    it('handles zero-length epochs gracefully', () => {
      const raw = makeSnapshot(['A', 'B', 'C']);
      const epochs = [
        { eventIndex: 10, rawLineCount: 3 },
        { eventIndex: 20, rawLineCount: 3 }, // Same as previous -> empty epoch
      ];

      const result = buildCleanDocument(raw, epochs);

      expect(result.cleanSnapshot.lines.length).toBe(3);
      expect(result.cleanSnapshot.lines.map(l => l.spans[0].text)).toEqual(['A', 'B', 'C']);
    });
  });

  describe('interior block matching', () => {
    it('deduplicates re-rendered content in the middle of an epoch', () => {
      // Epoch 0: A, B, C, D, E (5 lines)
      // Epoch 1: F, G, B, C, D, H, I (re-renders B,C,D in the middle)
      //
      // B,C,D match clean 1-3 (block of 3 in the interior) → dedup
      // F,G are new (before the match), H,I are new (after the match)
      // Expected clean: A, B, C, D, E, F, G, H, I (9 lines)
      const raw = makeSnapshot([
        'A', 'B', 'C', 'D', 'E',
        'F', 'G', 'B', 'C', 'D', 'H', 'I',
      ]);

      const epochs = [
        { eventIndex: 10, rawLineCount: 5 },
      ];

      const result = buildCleanDocument(raw, epochs);

      expect(result.cleanSnapshot.lines.length).toBe(9);
      expect(result.cleanSnapshot.lines.map(l => l.spans[0].text)).toEqual([
        'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I',
      ]);
    });

    it('matches against earlier epochs, not just the previous one', () => {
      // Epoch 0: A, B, C
      // Epoch 1: D, E, F (completely different)
      // Epoch 2: A, B, C, G, H (re-renders epoch 0 content, then new)
      //
      // Epoch 2: A,B,C match clean 0-2 (from epoch 0), G,H new
      // Expected clean: A, B, C, D, E, F, G, H (8 lines)
      const raw = makeSnapshot([
        'A', 'B', 'C',
        'D', 'E', 'F',
        'A', 'B', 'C', 'G', 'H',
      ]);

      const epochs = [
        { eventIndex: 10, rawLineCount: 3 },
        { eventIndex: 20, rawLineCount: 6 },
      ];

      const result = buildCleanDocument(raw, epochs);

      expect(result.cleanSnapshot.lines.length).toBe(8);
      expect(result.cleanSnapshot.lines.map(l => l.spans[0].text)).toEqual([
        'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
      ]);
    });
  });

  describe('partial overlap between consecutive epochs', () => {
    it('keeps non-matching lines as new content alongside deduped blocks', () => {
      // Epoch 0: A, B, C, D, E (5 lines)
      // Epoch 1: A, B, C, F, G (A,B,C match as block of 3, F,G are new)
      // Expected clean: A, B, C, D, E, F, G (7 lines)
      const raw = makeSnapshot([
        'A', 'B', 'C', 'D', 'E',
        'A', 'B', 'C', 'F', 'G',
      ]);

      const epochs = [
        { eventIndex: 10, rawLineCount: 5 },
      ];

      const result = buildCleanDocument(raw, epochs);

      expect(result.cleanSnapshot.lines.length).toBe(7);
      expect(result.cleanSnapshot.lines.map(l => l.spans[0].text)).toEqual([
        'A', 'B', 'C', 'D', 'E', 'F', 'G',
      ]);
    });
  });

  describe('no overlap (different content after clear)', () => {
    it('keeps all content when consecutive epochs have different lines', () => {
      // Epoch 0: A, B, C
      // Epoch 1: X, Y, Z (0% match)
      // Expected clean: A, B, C, X, Y, Z
      const raw = makeSnapshot([
        'A', 'B', 'C',
        'X', 'Y', 'Z',
      ]);

      const epochs = [
        { eventIndex: 10, rawLineCount: 3 },
      ];

      const result = buildCleanDocument(raw, epochs);

      expect(result.cleanSnapshot.lines.length).toBe(6);
      expect(result.cleanSnapshot.lines.map(l => l.spans[0].text)).toEqual([
        'A', 'B', 'C', 'X', 'Y', 'Z',
      ]);
    });
  });

  describe('overlap shorter than minimum threshold', () => {
    it('does not dedup when only 2 of 2 lines match (below MIN_MATCH)', () => {
      // Epoch 0: A, B
      // Epoch 1: A, B, C, D (match 2 consecutive = below MIN_MATCH=3)
      const raw = makeSnapshot([
        'A', 'B',
        'A', 'B', 'C', 'D',
      ]);

      const epochs = [
        { eventIndex: 10, rawLineCount: 2 },
      ];

      const result = buildCleanDocument(raw, epochs);

      expect(result.cleanSnapshot.lines.length).toBe(6);
    });

    it('deduplicates exactly 3 matching lines', () => {
      const raw = makeSnapshot([
        'A', 'B', 'C',
        'A', 'B', 'C', 'D',
      ]);

      const epochs = [
        { eventIndex: 10, rawLineCount: 3 },
      ];

      const result = buildCleanDocument(raw, epochs);

      expect(result.cleanSnapshot.lines.length).toBe(4);
      expect(result.cleanSnapshot.lines.map(l => l.spans[0].text)).toEqual([
        'A', 'B', 'C', 'D',
      ]);
    });
  });

  describe('styled lines match on text content', () => {
    it('matches lines with same text but different styles', () => {
      const raw: TerminalSnapshot = {
        cols: 80,
        rows: 24,
        lines: [
          { spans: [{ text: 'A' }] },
          { spans: [{ text: 'B', bold: true }] },
          { spans: [{ text: 'C', fg: 'red' }] },
          { spans: [{ text: 'A' }] },
          { spans: [{ text: 'B' }] },
          { spans: [{ text: 'C', fg: 'blue' }] },
          { spans: [{ text: 'D' }] },
        ],
      };

      const epochs = [
        { eventIndex: 10, rawLineCount: 3 },
      ];

      const result = buildCleanDocument(raw, epochs);

      expect(result.cleanSnapshot.lines.length).toBe(4);
      expect(result.cleanSnapshot.lines.map(l => l.spans[0].text)).toEqual(['A', 'B', 'C', 'D']);
    });
  });

  describe('below match rate — contiguous block too short', () => {
    it('does not dedup when no contiguous block reaches MIN_MATCH', () => {
      // Epoch 0: A, B, C, D, E, F (6 lines)
      // Epoch 1: A, X, Y, Z, W, V (only A matches — block of 1, < MIN_MATCH)
      const raw = makeSnapshot([
        'A', 'B', 'C', 'D', 'E', 'F',
        'A', 'X', 'Y', 'Z', 'W', 'V',
      ]);

      const epochs = [
        { eventIndex: 10, rawLineCount: 6 },
      ];

      const result = buildCleanDocument(raw, epochs);

      // No block >= 3 → no dedup
      expect(result.cleanSnapshot.lines.length).toBe(12);
    });

    it('deduplicates a 3-line contiguous block even when other lines differ', () => {
      // Epoch 0: A, B, C, D (4 lines)
      // Epoch 1: X, A, B, C, Y (A,B,C match clean 0-2 as block of 3; X,Y are new)
      const raw = makeSnapshot([
        'A', 'B', 'C', 'D',
        'X', 'A', 'B', 'C', 'Y',
      ]);

      const epochs = [
        { eventIndex: 10, rawLineCount: 4 },
      ];

      const result = buildCleanDocument(raw, epochs);

      // X is new, A,B,C deduped, Y is new
      expect(result.cleanSnapshot.lines.length).toBe(6);
      expect(result.cleanSnapshot.lines.map(l => l.spans[0].text)).toEqual([
        'A', 'B', 'C', 'D', 'X', 'Y',
      ]);
    });
  });

  describe('rawLineCountToClean mapping', () => {
    it('maps raw line counts to clean line counts correctly', () => {
      const raw = makeSnapshot([
        'A', 'B', 'C',
        'A', 'B', 'C', 'D', 'E',
      ]);

      const epochs = [
        { eventIndex: 10, rawLineCount: 3 },
      ];

      const result = buildCleanDocument(raw, epochs);

      expect(result.rawLineCountToClean(0)).toBe(0);
      expect(result.rawLineCountToClean(3)).toBe(3);
      expect(result.rawLineCountToClean(8)).toBe(5);
    });
  });

  describe('edge cases', () => {
    it('handles empty snapshot', () => {
      const raw = makeSnapshot([]);
      const result = buildCleanDocument(raw, []);

      expect(result.cleanSnapshot.lines.length).toBe(0);
    });

    it('handles single line snapshot with epochs', () => {
      const raw = makeSnapshot(['A']);
      const epochs = [{ eventIndex: 10, rawLineCount: 1 }];
      const result = buildCleanDocument(raw, epochs);

      expect(result.cleanSnapshot.lines.length).toBe(1);
    });

    it('handles epoch boundary at end of snapshot', () => {
      const raw = makeSnapshot(['A', 'B', 'C']);
      const epochs = [
        { eventIndex: 10, rawLineCount: 3 },
      ];
      const result = buildCleanDocument(raw, epochs);

      expect(result.cleanSnapshot.lines.length).toBe(3);
    });

    it('removes stutters (partial render followed by full render)', () => {
      // Simulates TUI startup: partial header, blank, full header + details
      // The partial header (line 0) + blank (line 1) should be removed
      const raw = makeSnapshot([
        'HEADER',     // partial render
        '',           // blank separator
        'HEADER',     // full render starts here
        'SUBTITLE',
        'INFO',
      ]);

      const epochs = [
        { eventIndex: 10, rawLineCount: 5 },
      ];

      const result = buildCleanDocument(raw, epochs);

      // Stutter removed: first HEADER + blank gone, only full render kept
      expect(result.cleanSnapshot.lines.length).toBe(3);
      expect(result.cleanSnapshot.lines.map(l => l.spans[0].text)).toEqual([
        'HEADER', 'SUBTITLE', 'INFO',
      ]);
    });

    it('does not remove non-stutter repeated lines', () => {
      // Lines with non-trivial content between repetitions should NOT be stutters
      const raw = makeSnapshot([
        'HEADER',
        'DIFFERENT_CONTENT',  // non-trivial line between
        'HEADER',
        'SUBTITLE',
      ]);

      const epochs = [
        { eventIndex: 10, rawLineCount: 4 },
      ];

      const result = buildCleanDocument(raw, epochs);

      // No stutter removal — all 4 lines kept
      expect(result.cleanSnapshot.lines.length).toBe(4);
    });

    it('handles multiple blocks within a single epoch', () => {
      // Epoch 0: A, B, C, D, E, F, G, H (8 lines)
      // Epoch 1: A, B, C, X, Y, F, G, H, Z
      //   Block 1: A,B,C match clean 0-2 (3 lines)
      //   X,Y are new (2 lines, no match)
      //   Block 2: F,G,H match clean 5-7 (3 lines)
      //   Z is new
      // Expected clean: A,B,C,D,E,F,G,H,X,Y,Z (11 lines)
      const raw = makeSnapshot([
        'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
        'A', 'B', 'C', 'X', 'Y', 'F', 'G', 'H', 'Z',
      ]);

      const epochs = [
        { eventIndex: 10, rawLineCount: 8 },
      ];

      const result = buildCleanDocument(raw, epochs);

      expect(result.cleanSnapshot.lines.length).toBe(11);
      expect(result.cleanSnapshot.lines.map(l => l.spans[0].text)).toEqual([
        'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X', 'Y', 'Z',
      ]);
    });
  });
});
