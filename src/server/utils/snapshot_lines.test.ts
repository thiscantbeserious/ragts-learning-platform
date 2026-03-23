// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseSnapshotLines } from './snapshot_lines.js';

describe('parseSnapshotLines', () => {
  it('returns empty array for null', () => {
    expect(parseSnapshotLines(null)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseSnapshotLines('')).toEqual([]);
  });

  it('parses raw SnapshotLine array', () => {
    const lines = [{ spans: [{ text: 'hello' }] }];
    expect(parseSnapshotLines(JSON.stringify(lines))).toEqual(lines);
  });

  it('unwraps TerminalSnapshot object with lines property', () => {
    const lines = [{ spans: [{ text: 'hello' }] }];
    const snapshot = { cols: 80, rows: 24, lines };
    expect(parseSnapshotLines(JSON.stringify(snapshot))).toEqual(lines);
  });

  it('returns empty array for object without lines', () => {
    expect(parseSnapshotLines(JSON.stringify({ cols: 80 }))).toEqual([]);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseSnapshotLines('not json')).toEqual([]);
  });

  it('returns empty array for non-object/non-array JSON', () => {
    expect(parseSnapshotLines('"just a string"')).toEqual([]);
    expect(parseSnapshotLines('42')).toEqual([]);
  });
});
