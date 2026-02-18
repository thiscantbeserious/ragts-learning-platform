import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseAsciicast,
  validateAsciicast,
  extractMarkers,
  computeCumulativeTimes,
} from '../src/shared/asciicast';
import type { AsciicastEvent, ParsedEvent } from '../src/shared/asciicast-types';

const fixturesPath = join(__dirname, 'fixtures');

function loadFixture(filename: string): string {
  return readFileSync(join(fixturesPath, filename), 'utf-8');
}

describe('validateAsciicast', () => {
  it('validates a valid v3 file with markers', () => {
    const content = loadFixture('valid-with-markers.cast');
    const result = validateAsciicast(content);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('validates a valid v3 file without markers', () => {
    const content = loadFixture('valid-without-markers.cast');
    const result = validateAsciicast(content);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects invalid version', () => {
    const content = loadFixture('invalid-version.cast');
    const result = validateAsciicast(content);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('version');
    expect(result.line).toBe(1);
  });

  it('rejects malformed JSON', () => {
    const content = loadFixture('malformed-json.cast');
    const result = validateAsciicast(content);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.line).toBe(3);
  });

  it('accepts header-only file (empty events)', () => {
    const content = loadFixture('header-only.cast');
    const result = validateAsciicast(content);
    expect(result.valid).toBe(true);
  });

  it('accepts marker at EOF', () => {
    const content = loadFixture('marker-at-eof.cast');
    const result = validateAsciicast(content);
    expect(result.valid).toBe(true);
  });

  it('rejects empty content', () => {
    const result = validateAsciicast('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('rejects missing header', () => {
    const result = validateAsciicast('[0.5,"o","test"]');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('version');
  });

  it('validates AGR-format header with term.cols/term.rows', () => {
    const content = '{"version":3,"term":{"cols":80,"rows":24,"type":"xterm-256color"},"command":"claude"}\n[0.1,"o","hello\\n"]';
    const result = validateAsciicast(content);
    expect(result.valid).toBe(true);
  });

  it('rejects header missing both width/height and term.cols/term.rows', () => {
    const content = '{"version":3}\n[0.1,"o","hello\\n"]';
    const result = validateAsciicast(content);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('term.cols/term.rows');
  });
});

describe('parseAsciicast', () => {
  it('parses valid file with markers', () => {
    const content = loadFixture('valid-with-markers.cast');
    const file = parseAsciicast(content);

    expect(file.header.version).toBe(3);
    expect(file.header.width).toBe(120);
    expect(file.header.height).toBe(40);
    expect(file.header.term?.cols).toBe(120);
    expect(file.header.term?.rows).toBe(40);
    expect(file.events.length).toBe(32);
    expect(file.markers.length).toBe(3);
  });

  it('parses valid file without markers', () => {
    const content = loadFixture('valid-without-markers.cast');
    const file = parseAsciicast(content);

    expect(file.header.version).toBe(3);
    expect(file.markers.length).toBe(0);
    expect(file.events.length).toBe(4);
  });

  it('parses header-only file', () => {
    const content = loadFixture('header-only.cast');
    const file = parseAsciicast(content);

    expect(file.header.version).toBe(3);
    expect(file.header.title).toBe('Empty session');
    expect(file.events.length).toBe(0);
    expect(file.markers.length).toBe(0);
  });

  it('throws on invalid content', () => {
    const content = loadFixture('invalid-version.cast');
    expect(() => parseAsciicast(content)).toThrow();
  });
});

describe('computeCumulativeTimes', () => {
  it('converts relative to cumulative timestamps', () => {
    const events: AsciicastEvent[] = [
      [0.5, 'o', 'first'],
      [0.2, 'o', 'second'],
      [0.3, 'o', 'third'],
    ];

    const parsed = computeCumulativeTimes(events);

    expect(parsed[0].time).toBe(0.5);
    expect(parsed[0].relativeTime).toBe(0.5);
    expect(parsed[1].time).toBe(0.7); // 0.5 + 0.2
    expect(parsed[1].relativeTime).toBe(0.2);
    expect(parsed[2].time).toBe(1.0); // 0.7 + 0.3
    expect(parsed[2].relativeTime).toBe(0.3);
  });

  it('handles zero deltas', () => {
    const events: AsciicastEvent[] = [
      [0.0, 'o', 'first'],
      [0.0, 'o', 'second'],
      [0.5, 'o', 'third'],
    ];

    const parsed = computeCumulativeTimes(events);

    expect(parsed[0].time).toBe(0.0);
    expect(parsed[1].time).toBe(0.0);
    expect(parsed[2].time).toBe(0.5);
  });

  it('preserves event data', () => {
    const events: AsciicastEvent[] = [
      [0.5, 'o', 'output text'],
      [0.1, 'm', 'marker label'],
      [0.2, 'r', '120x40'],
      [0.3, 'x', 0],
    ];

    const parsed = computeCumulativeTimes(events);

    expect(parsed[0].data).toBe('output text');
    expect(parsed[0].type).toBe('o');
    expect(parsed[1].data).toBe('marker label');
    expect(parsed[1].type).toBe('m');
    expect(parsed[2].data).toBe('120x40');
    expect(parsed[2].type).toBe('r');
    expect(parsed[3].data).toBe(0);
    expect(parsed[3].type).toBe('x');
  });

  it('handles empty events array', () => {
    const parsed = computeCumulativeTimes([]);
    expect(parsed).toEqual([]);
  });
});

describe('extractMarkers', () => {
  it('extracts markers from events', () => {
    const events: ParsedEvent[] = [
      { time: 0.5, relativeTime: 0.5, type: 'o', data: 'output' },
      { time: 0.7, relativeTime: 0.2, type: 'm', data: 'First marker' },
      { time: 1.0, relativeTime: 0.3, type: 'o', data: 'more output' },
      { time: 1.5, relativeTime: 0.5, type: 'm', data: 'Second marker' },
    ];

    const markers = extractMarkers(events);

    expect(markers.length).toBe(2);
    expect(markers[0].label).toBe('First marker');
    expect(markers[0].time).toBe(0.7);
    expect(markers[0].index).toBe(1);
    expect(markers[1].label).toBe('Second marker');
    expect(markers[1].time).toBe(1.5);
    expect(markers[1].index).toBe(3);
  });

  it('returns empty array when no markers', () => {
    const events: ParsedEvent[] = [
      { time: 0.5, relativeTime: 0.5, type: 'o', data: 'output' },
      { time: 1.0, relativeTime: 0.5, type: 'o', data: 'more output' },
    ];

    const markers = extractMarkers(events);
    expect(markers).toEqual([]);
  });

  it('handles marker at end of events', () => {
    const events: ParsedEvent[] = [
      { time: 0.5, relativeTime: 0.5, type: 'o', data: 'output' },
      { time: 1.0, relativeTime: 0.5, type: 'm', data: 'End marker' },
    ];

    const markers = extractMarkers(events);
    expect(markers.length).toBe(1);
    expect(markers[0].label).toBe('End marker');
    expect(markers[0].index).toBe(1);
  });

  it('handles non-string marker data', () => {
    const events: ParsedEvent[] = [
      { time: 0.5, relativeTime: 0.5, type: 'm', data: 123 as any },
    ];

    const markers = extractMarkers(events);
    expect(markers.length).toBe(1);
    expect(markers[0].label).toBe('123');
  });

  it('handles empty events array', () => {
    const markers = extractMarkers([]);
    expect(markers).toEqual([]);
  });
});

describe('Integration: full parsing flow', () => {
  it('parses and computes cumulative times correctly', () => {
    const content = loadFixture('valid-with-markers.cast');
    const file = parseAsciicast(content);

    // Verify cumulative time calculation (timestamps are relative deltas)
    // Event 0: [0.1,"o",...] → cumulative 0.1
    // Event 1: [0.2,"o",...] → cumulative 0.3
    // Event 2: [0.3,"o",...] → cumulative 0.6
    expect(file.events[0].time).toBeCloseTo(0.1);
    expect(file.events[1].time).toBeCloseTo(0.3);
    expect(file.events[2].time).toBeCloseTo(0.6);

    // Verify markers extracted correctly with cumulative times
    expect(file.markers[0].label).toBe('Test Execution');
    expect(file.markers[1].label).toBe('Build');
    expect(file.markers[2].label).toBe('Deploy');

    // Verify marker indices point to correct events
    const marker0Event = file.events[file.markers[0].index];
    expect(marker0Event.type).toBe('m');
    expect(marker0Event.data).toBe('Test Execution');
  });

  it('normalizes AGR-format header to width/height', () => {
    const content = '{"version":3,"term":{"cols":100,"rows":50,"type":"xterm-256color"},"command":"claude"}\n[0.1,"o","hello\\n"]';
    const file = parseAsciicast(content);

    expect(file.header.width).toBe(100);
    expect(file.header.height).toBe(50);
    expect(file.header.term?.cols).toBe(100);
    expect(file.header.term?.rows).toBe(50);
  });

  it('preserves v2-compat headers with top-level width/height', () => {
    const content = '{"version":3,"width":80,"height":24}\n[0.1,"o","hello\\n"]';
    const file = parseAsciicast(content);

    expect(file.header.width).toBe(80);
    expect(file.header.height).toBe(24);
  });
});
