/**
 * Snapshot tests for asciicast parser and validator.
 * Locks down parsed/normalized headers, marker extraction, and cumulative times.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseAsciicast,
  normalizeHeader,
  computeCumulativeTimes,
} from '../../../src/shared/asciicast.js';
import type { AsciicastEvent } from '../../../src/shared/asciicast-types.js';

const fixturesDir = join(__dirname, '../../fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

describe('asciicast snapshots', () => {
  it('valid-with-markers.cast — parsed header', () => {
    const file = parseAsciicast(loadFixture('valid-with-markers.cast'));
    expect(file.header).toMatchSnapshot();
  });

  it('valid-with-markers.cast — marker extraction', () => {
    const file = parseAsciicast(loadFixture('valid-with-markers.cast'));
    const markers = file.markers.map(m => ({
      label: m.label,
      index: m.index,
      time: Math.round(m.time * 1000) / 1000, // Round for determinism
    }));
    expect(markers).toMatchSnapshot();
  });

  it('valid-with-markers.cast — cumulative times first 10 events', () => {
    const file = parseAsciicast(loadFixture('valid-with-markers.cast'));
    const first10 = file.events.slice(0, 10).map(e => ({
      type: e.type,
      time: Math.round(e.time * 1000) / 1000,
      relativeTime: e.relativeTime,
    }));
    expect(first10).toMatchSnapshot();
  });

  it('normalizeHeader — v3 term.cols/rows to width/height', () => {
    const v3Header = normalizeHeader({
      version: 3,
      term: { cols: 120, rows: 40, type: 'xterm-256color' },
    });
    expect({
      version: v3Header.version,
      width: v3Header.width,
      height: v3Header.height,
      termCols: v3Header.term?.cols,
      termRows: v3Header.term?.rows,
    }).toMatchSnapshot();

    // V2-compat: top-level width/height preserved
    const v2Header = normalizeHeader({
      version: 3,
      width: 80,
      height: 24,
    });
    expect({
      version: v2Header.version,
      width: v2Header.width,
      height: v2Header.height,
    }).toMatchSnapshot();
  });

  it('computeCumulativeTimes — event sequence', () => {
    const events: AsciicastEvent[] = [
      [0.5, 'o', 'first'],
      [0, 'o', 'same-time'],
      [0.2, 'o', 'later'],
      [1, 'm', 'marker'],
      [0.3, 'r', '120x40'],
    ];

    const parsed = computeCumulativeTimes(events).map(e => ({
      type: e.type,
      time: Math.round(e.time * 1000) / 1000,
      relativeTime: e.relativeTime,
      data: e.data,
    }));

    expect(parsed).toMatchSnapshot();
  });
});
