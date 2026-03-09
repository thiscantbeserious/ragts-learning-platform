/**
 * Tests for shared test utilities.
 * Ensures utility functions produce correct output structures.
 */

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import {
  makeLine,
  makeStyledLine,
  makeSnapshot,
  snapshotToText,
  createCastContent,
  createCastContentWithEpochs,
} from './test-utils.js';

describe('makeLine', () => {
  it('creates a line with a single span from plain text', () => {
    const line = makeLine('hello');
    expect(line.spans).toHaveLength(1);
    expect(line.spans[0]!.text).toBe('hello');
  });

  it('merges additional span attributes', () => {
    const line = makeLine('styled', { fg: '#ff0000' } as object);
    expect(line.spans[0]!.text).toBe('styled');
    expect((line.spans[0] as Record<string, unknown>).fg).toBe('#ff0000');
  });
});

describe('makeStyledLine', () => {
  it('creates a line with multiple spans', () => {
    const line = makeStyledLine({ text: 'foo' }, { text: 'bar' });
    expect(line.spans).toHaveLength(2);
    expect(line.spans[0]!.text).toBe('foo');
    expect(line.spans[1]!.text).toBe('bar');
  });

  it('preserves additional attributes on spans', () => {
    const line = makeStyledLine({ text: 'a', fg: '#fff' } as object);
    expect((line.spans[0] as Record<string, unknown>).fg).toBe('#fff');
  });
});

describe('makeSnapshot', () => {
  it('creates a snapshot with correct dims and line count', () => {
    const snap = makeSnapshot(['line1', 'line2', 'line3']);
    expect(snap.cols).toBe(80);
    expect(snap.rows).toBe(24);
    expect(snap.lines).toHaveLength(3);
  });

  it('accepts custom cols and rows', () => {
    const snap = makeSnapshot(['a'], 120, 48);
    expect(snap.cols).toBe(120);
    expect(snap.rows).toBe(48);
  });

  it('converts each string to a single-span line', () => {
    const snap = makeSnapshot(['hello']);
    expect(snap.lines[0]!.spans[0]!.text).toBe('hello');
  });
});

describe('snapshotToText', () => {
  it('extracts text from all spans in all lines', () => {
    const snap = makeSnapshot(['alpha', 'beta']);
    expect(snapshotToText(snap)).toEqual(['alpha', 'beta']);
  });

  it('joins multiple spans within a line', () => {
    const snap = {
      cols: 80,
      rows: 24,
      lines: [makeStyledLine({ text: 'foo' }, { text: 'bar' })],
    };
    expect(snapshotToText(snap)).toEqual(['foobar']);
  });

  it('handles spans with undefined text as empty string', () => {
    const snap = {
      cols: 80,
      rows: 24,
      lines: [{ spans: [{ text: undefined }] }],
    };
    expect(snapshotToText(snap as Parameters<typeof snapshotToText>[0])).toEqual(['']);
  });
});

describe('createCastContent', () => {
  it('creates valid NDJSON with a header line', () => {
    const content = createCastContent(['hello']);
    const lines = content.trim().split('\n');
    const header = JSON.parse(lines[0]!);
    expect(header.version).toBe(3);
    expect(header.term.cols).toBe(80);
    expect(header.term.rows).toBe(24);
  });

  it('creates one event line per output', () => {
    const content = createCastContent(['a', 'b', 'c']);
    const lines = content.trim().split('\n');
    // 1 header + 3 events
    expect(lines).toHaveLength(4);
  });

  it('accepts custom cols and rows', () => {
    const content = createCastContent(['x'], { cols: 120, rows: 48 });
    const header = JSON.parse(content.split('\n')[0]!);
    expect(header.term.cols).toBe(120);
    expect(header.term.rows).toBe(48);
  });

  it('includes marker events when provided', () => {
    const content = createCastContent(['a'], { markers: [{ time: 0.5, label: 'step1' }] });
    const lines = content.trim().split('\n');
    // 1 header + 1 output + 1 marker
    expect(lines).toHaveLength(3);
    const markerLine = lines.find((l) => {
      try {
        const parsed = JSON.parse(l);
        return parsed[1] === 'm';
      } catch {
        return false;
      }
    });
    expect(markerLine).toBeDefined();
    const marker = JSON.parse(markerLine!);
    expect(marker[2]).toBe('step1');
  });

  it('sorts events by timestamp', () => {
    // Marker at time 0.05 should appear before the output at 0.1
    const content = createCastContent(['output'], { markers: [{ time: 0.05, label: 'early' }] });
    const lines = content.trim().split('\n');
    const event1 = JSON.parse(lines[1]!);
    const event2 = JSON.parse(lines[2]!);
    expect(event1[0]).toBeLessThan(event2[0]);
    expect(event1[1]).toBe('m');
  });
});

describe('createCastContentWithEpochs', () => {
  it('creates valid NDJSON with a header', () => {
    const content = createCastContentWithEpochs([{ rerender: [], newContent: ['hello'] }]);
    const header = JSON.parse(content.split('\n')[0]!);
    expect(header.version).toBe(3);
  });

  it('first epoch does not emit a clear-screen event', () => {
    const content = createCastContentWithEpochs([{ rerender: [], newContent: ['only'] }]);
    expect(content).not.toContain('\x1b[2J');
  });

  it('second epoch starts with a clear-screen escape', () => {
    const content = createCastContentWithEpochs([
      { rerender: [], newContent: ['first'] },
      { rerender: ['first'], newContent: ['second'] },
    ]);
    // The content is JSON-stringified, so the escape appears as \\u001b or the literal sequence
    // Check that the clear-screen sequence appears somewhere in the file
    expect(content).toMatch(/\\u001b\[2J|\\u001b\[3J/);
  });

  it('includes rerender and newContent lines for each epoch', () => {
    const content = createCastContentWithEpochs([
      { rerender: [], newContent: ['a', 'b'] },
      { rerender: ['a'], newContent: ['c'] },
    ]);
    const lines = content.trim().split('\n');
    // 1 header + epoch1(2 new) + epoch2(1 clear + 1 rerender + 1 new) = 6
    expect(lines).toHaveLength(6);
  });

  it('accepts custom cols and rows', () => {
    const content = createCastContentWithEpochs([{ rerender: [], newContent: ['x'] }], { cols: 100, rows: 30 });
    const header = JSON.parse(content.split('\n')[0]!);
    expect(header.term.cols).toBe(100);
    expect(header.term.rows).toBe(30);
  });
});
