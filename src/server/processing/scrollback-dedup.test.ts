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
    it('deduplicates when consecutive epochs have high match rate', () => {
      // Epoch 0: A, B, C (lines 0-2)
      // Epoch 1: A, B, C, D, E (lines 3-7, re-renders A,B,C then adds D,E)
      // Epoch 2: A, B, C, D, E, F, G (lines 8-14, re-renders A,B,C,D,E then adds F,G)
      //
      // Epoch 1 vs Epoch 0: 3/3 match (100%) → DEDUP, keep D,E as new
      // Epoch 2 vs Epoch 1: 5/5 match (100%) → DEDUP, keep F,G as new
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

  describe('partial overlap between consecutive epochs', () => {
    it('deduplicates when epoch re-renders part of previous content', () => {
      // Epoch 0: A, B, C, D, E (5 lines)
      // Epoch 1: A, B, C, F, G (first 3 match = 60% of min(5,5))
      // 60% > 50% threshold → DEDUP
      // Overlap = min(5, 5) = 5 lines compared, overlap declared
      // But only first 3 match. Algorithm maps ALL 5 to prev positions, then no new lines.
      // Actually: compareLen=5, matchCount=3, matchRate=60% → overlap=5
      // All 5 epoch1 lines map to epoch0's clean positions.
      // Result: same as epoch0 = [A, B, C, D, E]
      const raw = makeSnapshot([
        'A', 'B', 'C', 'D', 'E',
        'A', 'B', 'C', 'F', 'G',
      ]);

      const epochs = [
        { eventIndex: 10, rawLineCount: 5 },
      ];

      const result = buildCleanDocument(raw, epochs);

      // Overlap detected (60%), all 5 lines mapped to epoch 0 positions
      // Clean doc keeps epoch 0's version: [A, B, C, D, E]
      expect(result.cleanSnapshot.lines.length).toBe(5);
      expect(result.cleanSnapshot.lines.map(l => l.spans[0].text)).toEqual([
        'A', 'B', 'C', 'D', 'E',
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
      // Epoch 1: A, B, C, D (match 2/2 = 100% but only 2 matching lines, below MIN_MATCH=3)
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

  describe('below match rate threshold', () => {
    it('does not dedup when match rate is below 50%', () => {
      // Epoch 0: A, B, C, D, E, F (6 lines)
      // Epoch 1: A, X, Y, Z, W, V (only 1/6 match = 17%)
      const raw = makeSnapshot([
        'A', 'B', 'C', 'D', 'E', 'F',
        'A', 'X', 'Y', 'Z', 'W', 'V',
      ]);

      const epochs = [
        { eventIndex: 10, rawLineCount: 6 },
      ];

      const result = buildCleanDocument(raw, epochs);

      // 17% match rate < 50% → no dedup
      expect(result.cleanSnapshot.lines.length).toBe(12);
    });

    it('deduplicates when match rate is exactly 50%', () => {
      // Epoch 0: A, B, C, D (4 lines)
      // Epoch 1: A, X, C, D, E (compare first 4: 3/4 match = 75%)
      const raw = makeSnapshot([
        'A', 'B', 'C', 'D',
        'A', 'X', 'C', 'D', 'E',
      ]);

      const epochs = [
        { eventIndex: 10, rawLineCount: 4 },
      ];

      const result = buildCleanDocument(raw, epochs);

      // 75% match → overlap, only E is new
      expect(result.cleanSnapshot.lines.length).toBe(5);
      expect(result.cleanSnapshot.lines[4].spans[0].text).toBe('E');
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
  });
});
