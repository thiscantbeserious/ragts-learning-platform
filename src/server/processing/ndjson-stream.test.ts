/**
 * Tests for NdjsonStream - streaming NDJSON parser for .cast files.
 *
 * Tests the low-level streaming component before integrating with SessionProcessor.
 */

import { describe, it, expect } from 'vitest';
import { NdjsonStream } from './ndjson-stream.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('NdjsonStream', () => {
  describe('Cycle 3: Basic parsing', () => {
    it('parses header and events from simple .cast file', async () => {
      const tempDir = join(tmpdir(), 'ragts-test-' + Date.now());
      mkdirSync(tempDir, { recursive: true });
      const testFile = join(tempDir, 'parse.cast');

      const header = { version: 3, term: { cols: 80, rows: 24 } };
      const events = [
        [0.5, 'o', 'Hello\n'],
        [0.1, 'o', 'World\n'],
      ];

      const content = [
        JSON.stringify(header),
        ...events.map(e => JSON.stringify(e)),
      ].join('\n');

      writeFileSync(testFile, content);

      const stream = new NdjsonStream(testFile);
      const results: Array<{ header?: any; event?: any }> = [];

      for await (const item of stream) {
        results.push(item);
      }

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ header });
      expect(results[1]).toEqual({ event: events[0] });
      expect(results[2]).toEqual({ event: events[1] });
    });

    it('handles empty lines gracefully', async () => {
      const tempDir = join(tmpdir(), 'ragts-test-' + Date.now());
      mkdirSync(tempDir, { recursive: true });
      const testFile = join(tempDir, 'empty-lines.cast');

      const header = { version: 3, term: { cols: 80, rows: 24 } };
      const content = [
        JSON.stringify(header),
        '',
        JSON.stringify([0.5, 'o', 'Test\n']),
        '',
        '',
      ].join('\n');

      writeFileSync(testFile, content);

      const stream = new NdjsonStream(testFile);
      const results: Array<{ header?: any; event?: any }> = [];

      for await (const item of stream) {
        results.push(item);
      }

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ header });
      expect(results[1]).toEqual({ event: [0.5, 'o', 'Test\n'] });
    });
  });

  describe('Cycle 6: Malformed lines', () => {
    it('skips malformed JSON lines without crashing', async () => {
      const tempDir = join(tmpdir(), 'ragts-test-' + Date.now());
      mkdirSync(tempDir, { recursive: true });
      const testFile = join(tempDir, 'malformed.cast');

      const header = { version: 3, term: { cols: 80, rows: 24 } };
      const content = [
        JSON.stringify(header),
        JSON.stringify([0.5, 'o', 'Good line\n']),
        'this is not valid json {{{',
        JSON.stringify([0.1, 'o', 'Another good line\n']),
      ].join('\n');

      writeFileSync(testFile, content);

      const stream = new NdjsonStream(testFile);
      const results: Array<{ header?: any; event?: any }> = [];

      for await (const item of stream) {
        results.push(item);
      }

      // Should have header + 2 good events, malformed line skipped
      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ header });
      expect(results[1]).toEqual({ event: [0.5, 'o', 'Good line\n'] });
      expect(results[2]).toEqual({ event: [0.1, 'o', 'Another good line\n'] });
    });
  });

  describe('Cycle 7: Invalid event format', () => {
    it('skips events that are not arrays', async () => {
      const tempDir = join(tmpdir(), 'ragts-test-' + Date.now());
      mkdirSync(tempDir, { recursive: true });
      const testFile = join(tempDir, 'invalid-event.cast');

      const header = { version: 3, term: { cols: 80, rows: 24 } };
      const content = [
        JSON.stringify(header),
        JSON.stringify([0.5, 'o', 'Good event\n']),
        JSON.stringify({ bad: 'event', not: 'array' }),
        JSON.stringify([0.1, 'o', 'Another good event\n']),
      ].join('\n');

      writeFileSync(testFile, content);

      const stream = new NdjsonStream(testFile);
      const results: Array<{ header?: any; event?: any }> = [];

      for await (const item of stream) {
        results.push(item);
      }

      // Should have header + 2 valid events, invalid event skipped
      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ header });
      expect(results[1]).toEqual({ event: [0.5, 'o', 'Good event\n'] });
      expect(results[2]).toEqual({ event: [0.1, 'o', 'Another good event\n'] });
    });
  });
});
