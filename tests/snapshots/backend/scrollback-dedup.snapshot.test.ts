/**
 * Snapshot tests for scrollback dedup algorithm.
 * Locks down the dedup output for all major code paths.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildCleanDocument, type EpochBoundary } from '../../../src/server/processing/scrollback-dedup.js';
import { initVt, createVt } from '../../../packages/vt-wasm/index.js';
import type { TerminalSnapshot, SnapshotLine } from '../../../packages/vt-wasm/types.js';
import { makeLine, makeSnapshot, makeStyledLine, snapshotToText } from '../../helpers/test-utils.js';

beforeAll(async () => {
  await initVt();
});

/** Build a snapshot from plain text lines. */
function textSnapshot(texts: string[], cols = 80, rows = 24): TerminalSnapshot {
  return makeSnapshot(texts, cols, rows);
}

describe('scrollback-dedup snapshots', () => {
  it('zero epochs — identity transform', () => {
    const raw = textSnapshot([
      'Line one',
      'Line two',
      'Line three',
    ]);
    const result = buildCleanDocument(raw, []);

    expect(snapshotToText(result.cleanSnapshot)).toMatchSnapshot();
    expect(result.rawToClean(0)).toBe(0);
    expect(result.rawToClean(1)).toBe(1);
    expect(result.rawToClean(2)).toBe(2);
    expect(result.rawLineCountToClean(3)).toBe(3);
  });

  it('3-epoch progressive re-renders — clean texts', () => {
    // Epoch 0: lines 0-4 (header + initial content)
    // Epoch 1: lines 5-10 (re-renders 0-4, adds 5-6)
    // Epoch 2: lines 11-18 (re-renders 0-6, adds 7-10)
    const raw = textSnapshot([
      // Epoch 0
      'Welcome to Claude Code',
      'Type your request below',
      '---',
      '> How do I fix this bug?',
      'Let me look at the code...',
      // Epoch 1 — re-renders epoch 0, adds new
      'Welcome to Claude Code',
      'Type your request below',
      '---',
      '> How do I fix this bug?',
      'Let me look at the code...',
      'I found the issue in line 42.',
      'Here is the fix:',
      // Epoch 2 — re-renders epochs 0+1, adds new
      'Welcome to Claude Code',
      'Type your request below',
      '---',
      '> How do I fix this bug?',
      'Let me look at the code...',
      'I found the issue in line 42.',
      'Here is the fix:',
      '```diff',
      '- const x = null;',
      '+ const x = getDefault();',
      '```',
    ]);

    const epochs: EpochBoundary[] = [
      { eventIndex: 10, rawLineCount: 5 },
      { eventIndex: 20, rawLineCount: 12 },
    ];

    const result = buildCleanDocument(raw, epochs);
    const cleanTexts = snapshotToText(result.cleanSnapshot);

    expect(cleanTexts).toMatchSnapshot();
    expect(cleanTexts.length).toBe(11); // 5 original + 2 new in epoch1 + 4 new in epoch2
  });

  it('3-epoch progressive re-renders — rawToClean mapping array', () => {
    const raw = textSnapshot([
      'A', 'B', 'C',         // epoch 0: lines 0-2
      'A', 'B', 'C', 'D',    // epoch 1: re-render A,B,C + new D
      'A', 'B', 'C', 'D', 'E', // epoch 2: re-render A,B,C,D + new E
    ]);

    const epochs: EpochBoundary[] = [
      { eventIndex: 5, rawLineCount: 3 },
      { eventIndex: 10, rawLineCount: 7 },
    ];

    const result = buildCleanDocument(raw, epochs);
    const mappings: number[] = [];
    for (let i = 0; i < raw.lines.length; i++) {
      mappings.push(result.rawToClean(i));
    }

    expect(mappings).toMatchSnapshot();
    expect(snapshotToText(result.cleanSnapshot)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('epoch boundary spanning — known limitation', () => {
    // The per-epoch algorithm can't match blocks that span epoch boundaries.
    // A header at the end of one epoch + content at the start of the next
    // won't be matched as a single block.
    const raw = textSnapshot([
      'Header',
      'Content A',
      'Content B',
      // Epoch boundary falls here
      'Header',       // This re-renders the header
      'Content A',    // This re-renders Content A
      'Content B',    // This re-renders Content B
      'New stuff',
    ]);

    const epochs: EpochBoundary[] = [
      { eventIndex: 5, rawLineCount: 3 },
    ];

    const result = buildCleanDocument(raw, epochs);
    const cleanTexts = snapshotToText(result.cleanSnapshot);

    expect(cleanTexts).toMatchSnapshot();
    // Header+Content A+Content B are re-rendered as a block in epoch 1
    // so they should be deduped (block of 3 >= MIN_MATCH)
    expect(cleanTexts).toContain('New stuff');
  });

  it('stutter removal — clean output', () => {
    // Pattern: line K is non-trivial, followed by trivial lines, then same text at K+N
    const raw = textSnapshot([
      'Important header text here',  // stuttered copy
      '',                             // trivial
      '',                             // trivial
      'Important header text here',  // real copy
      'Next content line',
    ]);

    const epochs: EpochBoundary[] = [
      { eventIndex: 5, rawLineCount: 0 },
    ];

    const result = buildCleanDocument(raw, epochs);
    const cleanTexts = snapshotToText(result.cleanSnapshot);

    expect(cleanTexts).toMatchSnapshot();
  });

  it('rawToClean for stuttered line index — probe-forward fallback', () => {
    // Stuttered lines have no direct mapping — rawToClean probes forward
    const raw = textSnapshot([
      'Stutter line here!!!!',  // index 0: will be stuttered
      '',                        // index 1: trivial
      'Stutter line here!!!!',  // index 2: real
      'Following content',       // index 3
    ]);

    const epochs: EpochBoundary[] = [
      { eventIndex: 3, rawLineCount: 0 },
    ];

    const result = buildCleanDocument(raw, epochs);

    // rawToClean(0) should probe forward and find a valid mapping
    const mappedStutter = result.rawToClean(0);
    const mappedReal = result.rawToClean(2);

    expect({ mappedStutter, mappedReal }).toMatchSnapshot();
  });

  it('interior block matching — multiple blocks in single epoch', () => {
    const raw = textSnapshot([
      'Block A line 1',
      'Block A line 2',
      'Block A line 3',
      'Unique separator',
      'Block B line 1',
      'Block B line 2',
      'Block B line 3',
      // Epoch 1: re-renders both blocks with new content between
      'Block A line 1',
      'Block A line 2',
      'Block A line 3',
      'New middle content',
      'Block B line 1',
      'Block B line 2',
      'Block B line 3',
      'Appended content',
    ]);

    const epochs: EpochBoundary[] = [
      { eventIndex: 10, rawLineCount: 7 },
    ];

    const result = buildCleanDocument(raw, epochs);
    const cleanTexts = snapshotToText(result.cleanSnapshot);

    expect(cleanTexts).toMatchSnapshot();
    // Should contain the unique separator, new middle content, and appended content
    expect(cleanTexts).toContain('Unique separator');
    expect(cleanTexts).toContain('New middle content');
    expect(cleanTexts).toContain('Appended content');
  });

  it('below MIN_MATCH threshold — no dedup', () => {
    // Blocks of only 2 matching lines should NOT be deduped (MIN_MATCH = 3)
    const raw = textSnapshot([
      'Short A',
      'Short B',
      // Epoch 1
      'Short A',
      'Short B',
      'New content',
    ]);

    const epochs: EpochBoundary[] = [
      { eventIndex: 5, rawLineCount: 2 },
    ];

    const result = buildCleanDocument(raw, epochs);
    const cleanTexts = snapshotToText(result.cleanSnapshot);

    expect(cleanTexts).toMatchSnapshot();
    // 2-line block is below MIN_MATCH, so both copies should appear
    expect(cleanTexts.length).toBe(5);
  });

  it('styled lines — match on text only', () => {
    // Lines with different styles but same text should match
    const raw: TerminalSnapshot = {
      cols: 80,
      rows: 24,
      lines: [
        makeStyledLine({ text: 'Same text', fg: 1, bold: true }),
        makeStyledLine({ text: 'Same text', fg: 1, bold: true }),
        makeStyledLine({ text: 'Same text', fg: 1, bold: true }),
        // Epoch 1
        makeStyledLine({ text: 'Same text', fg: 2, italic: true }),
        makeStyledLine({ text: 'Same text', fg: 2, italic: true }),
        makeStyledLine({ text: 'Same text', fg: 2, italic: true }),
        makeStyledLine({ text: 'New content' }),
      ],
    };

    const epochs: EpochBoundary[] = [
      { eventIndex: 5, rawLineCount: 3 },
    ];

    const result = buildCleanDocument(raw, epochs);
    const cleanTexts = snapshotToText(result.cleanSnapshot);

    expect(cleanTexts).toMatchSnapshot();
    // The 3-line block matches on text, so only one copy + new content
    expect(cleanTexts).toContain('New content');
  });

  it('rawLineCountToClean — boundary values', () => {
    const raw = textSnapshot([
      'A', 'B', 'C',       // epoch 0
      'A', 'B', 'C', 'D',  // epoch 1: re-render + new
    ]);

    const epochs: EpochBoundary[] = [
      { eventIndex: 5, rawLineCount: 3 },
    ];

    const result = buildCleanDocument(raw, epochs);

    const boundaryMappings = {
      at0: result.rawLineCountToClean(0),
      at3: result.rawLineCountToClean(3),
      at7: result.rawLineCountToClean(7),
      beyondEnd: result.rawLineCountToClean(100),
      negative: result.rawLineCountToClean(-1),
    };

    expect(boundaryMappings).toMatchSnapshot();
  });

  it('synthetic TUI fixture through VT + dedup integration', () => {
    // Read the synthetic TUI session .cast and process through VT + dedup
    const castContent = readFileSync(
      join(__dirname, '../../fixtures/synthetic-tui-session.cast'),
      'utf-8'
    );
    const lines = castContent.split('\n').filter(l => l.trim());
    const header = JSON.parse(lines[0]);
    const events = lines.slice(1).map(l => JSON.parse(l));

    // Replay through VT
    const vt = createVt(header.term.cols, header.term.rows, 200000);
    const epochBoundaries: EpochBoundary[] = [];

    for (const event of events) {
      const [, type, data] = event;
      if (type === 'o') {
        const str = String(data);
        vt.feed(str.replaceAll('\x1b[3J', ''));
        if (str.includes('\x1b[2J') || str.includes('\x1b[3J')) {
          const lineCount = vt.getAllLines().lines.length;
          if (epochBoundaries.length === 0 || epochBoundaries[epochBoundaries.length - 1].rawLineCount !== lineCount) {
            epochBoundaries.push({ eventIndex: events.indexOf(event), rawLineCount: lineCount });
          }
        }
      }
    }

    const rawSnapshot = vt.getAllLines();
    vt.free();

    const result = buildCleanDocument(rawSnapshot, epochBoundaries);
    const cleanTexts = snapshotToText(result.cleanSnapshot).map(t => t.trimEnd());

    expect(cleanTexts).toMatchSnapshot();
    // Clean snapshot should have dedup applied (fewer or equal lines to raw)
    expect(result.cleanSnapshot.lines.length).toBeLessThanOrEqual(rawSnapshot.lines.length);
  });

  it('empty epoch — no crash', () => {
    const raw = textSnapshot(['A', 'B', 'C']);
    const epochs: EpochBoundary[] = [
      { eventIndex: 2, rawLineCount: 0 }, // Empty epoch at start
      { eventIndex: 5, rawLineCount: 3 },
    ];

    const result = buildCleanDocument(raw, epochs);
    const cleanTexts = snapshotToText(result.cleanSnapshot);

    expect(cleanTexts).toMatchSnapshot();
  });
});
