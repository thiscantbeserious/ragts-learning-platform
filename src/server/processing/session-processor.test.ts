/**
 * Tests for SessionProcessor - server-side terminal session processing.
 *
 * Following TDD outside-in approach:
 * - Start with high-level processor API
 * - Work inward to implementation details
 * - Each test drives the next piece of implementation
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { processSession } from './session-processor.js';
import { initVt } from '../../../packages/vt-wasm/index.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize WASM module once before all tests
beforeAll(async () => {
  await initVt();
});

describe('SessionProcessor', () => {
  describe('Cycle 1: Empty session', () => {
    it('processes empty session and returns header with zero events', async () => {
      // Create a minimal .cast file with only header
      const tempDir = join(tmpdir(), 'ragts-test-' + Date.now());
      mkdirSync(tempDir, { recursive: true });
      const testFile = join(tempDir, 'empty.cast');

      const header = { version: 3, term: { cols: 80, rows: 24 } };
      writeFileSync(testFile, JSON.stringify(header) + '\n');

      const result = await processSession(testFile, []);

      expect(result.header.version).toBe(3);
      expect(result.header.width).toBe(80);
      expect(result.header.height).toBe(24);
      expect(result.eventCount).toBe(0);
      expect(result.snapshots).toEqual([]);
    });
  });

  describe('Cycle 2: Simple session', () => {
    it('counts events correctly', async () => {
      const tempDir = join(tmpdir(), 'ragts-test-' + Date.now());
      mkdirSync(tempDir, { recursive: true });
      const testFile = join(tempDir, 'simple.cast');

      const header = { version: 3, term: { cols: 80, rows: 24 } };
      const events = [
        [0.5, 'o', 'Hello\n'],
        [0.1, 'o', 'World\n'],
        [0.2, 'm', 'marker'],
      ];

      const content = [
        JSON.stringify(header),
        ...events.map(e => JSON.stringify(e)),
      ].join('\n');

      writeFileSync(testFile, content);

      const result = await processSession(testFile, []);

      expect(result.header.version).toBe(3);
      expect(result.header.width).toBe(80);
      expect(result.header.height).toBe(24);
      expect(result.eventCount).toBe(3);
      expect(result.snapshots).toEqual([]);
    });
  });

  describe('Cycle 4: Boundary snapshots', () => {
    it('captures snapshot at specified boundary event', async () => {
      const tempDir = join(tmpdir(), 'ragts-test-' + Date.now());
      mkdirSync(tempDir, { recursive: true });
      const testFile = join(tempDir, 'boundary.cast');

      const header = { version: 3, term: { cols: 80, rows: 24 } };
      const events = [
        [0.5, 'o', 'Line 1\n'],
        [0.1, 'o', 'Line 2\n'],
        [0.2, 'o', 'Line 3\n'],
      ];

      const content = [
        JSON.stringify(header),
        ...events.map(e => JSON.stringify(e)),
      ].join('\n');

      writeFileSync(testFile, content);

      // Capture snapshot after event 1 (0-indexed)
      const result = await processSession(testFile, [1]);

      expect(result.eventCount).toBe(3);
      expect(result.snapshots).toHaveLength(1);
      expect(result.snapshots[0].boundaryEvent).toBe(1);
      expect(result.snapshots[0].snapshot).toBeDefined();
      expect(result.snapshots[0].snapshot.cols).toBe(80);
      expect(result.snapshots[0].snapshot.rows).toBe(24);
    });

    it('captures multiple snapshots at different boundaries', async () => {
      const tempDir = join(tmpdir(), 'ragts-test-' + Date.now());
      mkdirSync(tempDir, { recursive: true });
      const testFile = join(tempDir, 'multi-boundary.cast');

      const header = { version: 3, term: { cols: 80, rows: 24 } };
      const events = [
        [0.5, 'o', 'Event 0\n'],
        [0.1, 'o', 'Event 1\n'],
        [0.2, 'o', 'Event 2\n'],
        [0.1, 'o', 'Event 3\n'],
      ];

      const content = [
        JSON.stringify(header),
        ...events.map(e => JSON.stringify(e)),
      ].join('\n');

      writeFileSync(testFile, content);

      const result = await processSession(testFile, [0, 2, 3]);

      expect(result.eventCount).toBe(4);
      expect(result.snapshots).toHaveLength(3);
      expect(result.snapshots[0].boundaryEvent).toBe(0);
      expect(result.snapshots[1].boundaryEvent).toBe(2);
      expect(result.snapshots[2].boundaryEvent).toBe(3);
    });
  });

  describe('Cycle 5: Snapshot structure', () => {
    it('snapshot contains lines with spans', async () => {
      const tempDir = join(tmpdir(), 'ragts-test-' + Date.now());
      mkdirSync(tempDir, { recursive: true });
      const testFile = join(tempDir, 'snapshot-structure.cast');

      const header = { version: 3, term: { cols: 80, rows: 24 } };
      const events = [
        [0.5, 'o', 'Hello World'],
      ];

      const content = [
        JSON.stringify(header),
        ...events.map(e => JSON.stringify(e)),
      ].join('\n');

      writeFileSync(testFile, content);

      const result = await processSession(testFile, [0]);

      expect(result.snapshots).toHaveLength(1);
      const snapshot = result.snapshots[0].snapshot;

      // Snapshot should have the correct structure
      expect(snapshot.cols).toBe(80);
      expect(snapshot.rows).toBe(24);
      expect(snapshot.lines).toBeDefined();
      expect(Array.isArray(snapshot.lines)).toBe(true);

      // Each line should have spans
      expect(snapshot.lines.length).toBeGreaterThan(0);
      const firstLine = snapshot.lines[0];
      expect(firstLine.spans).toBeDefined();
      expect(firstLine.spans.length).toBeGreaterThan(0);
      const firstSpan = firstLine.spans[0];
      expect(firstSpan.text).toBeDefined();
      expect(typeof firstSpan.text).toBe('string');
    });

    it('processes terminal escape sequences correctly', async () => {
      const tempDir = join(tmpdir(), 'ragts-test-' + Date.now());
      mkdirSync(tempDir, { recursive: true });
      const testFile = join(tempDir, 'escape-sequences.cast');

      const header = { version: 3, term: { cols: 80, rows: 24 } };
      // ANSI escape sequence for bold red text
      const events = [
        [0.5, 'o', '\x1b[1;31mRed Bold Text\x1b[0m'],
      ];

      const content = [
        JSON.stringify(header),
        ...events.map(e => JSON.stringify(e)),
      ].join('\n');

      writeFileSync(testFile, content);

      const result = await processSession(testFile, [0]);

      expect(result.snapshots).toHaveLength(1);
      const snapshot = result.snapshots[0].snapshot;

      // The VT should have processed the escape sequences
      // We expect the terminal to contain the text content
      expect(snapshot.lines).toBeDefined();
      expect(snapshot.lines.length).toBeGreaterThan(0);
    });
  });

  describe('Cycle 8: Real fixture file', () => {
    it('processes the valid-with-markers.cast fixture', async () => {
      // Path to the fixture file
      const fixtureFile = join(__dirname, '../../../tests/fixtures/valid-with-markers.cast');

      // The fixture has markers at event indices 3, 14, 24
      // Let's capture snapshots at those boundaries
      const result = await processSession(fixtureFile, [3, 14, 24]);

      expect(result.header).toBeDefined();
      expect(result.header.version).toBe(3);
      expect(result.eventCount).toBeGreaterThan(0);
      expect(result.snapshots.length).toBeGreaterThan(0);

      // Verify each snapshot has the expected structure
      for (const snap of result.snapshots) {
        expect(snap.boundaryEvent).toBeDefined();
        expect(snap.snapshot).toBeDefined();
        expect(snap.snapshot.cols).toBe(result.header.width);
        expect(snap.snapshot.rows).toBe(result.header.height);
      }
    });
  });

  describe('Cycle 9: Performance', () => {
    it('processes session without excessive memory', async () => {
      // Create a larger session to test streaming efficiency
      const tempDir = join(tmpdir(), 'ragts-test-' + Date.now());
      mkdirSync(tempDir, { recursive: true });
      const testFile = join(tempDir, 'large.cast');

      const header = { version: 3, term: { cols: 80, rows: 24 } };
      const lines = [JSON.stringify(header)];

      // Generate 1000 events
      for (let i = 0; i < 1000; i++) {
        lines.push(JSON.stringify([0.01, 'o', `Line ${i}\n`]));
      }

      writeFileSync(testFile, lines.join('\n'));

      const startMemory = process.memoryUsage().heapUsed;
      const startTime = Date.now();

      const result = await processSession(testFile, [100, 500, 999]);

      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;

      expect(result.eventCount).toBe(1000);
      expect(result.snapshots).toHaveLength(3);

      // Should complete reasonably fast
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(5000); // Less than 5 seconds

      // Memory usage should be reasonable (not loading entire file at once)
      const memoryDelta = (endMemory - startMemory) / 1024 / 1024; // MB
      console.log(`Memory delta: ${memoryDelta.toFixed(2)} MB, Duration: ${duration}ms`);

      // This is a soft check - we're just ensuring we're not catastrophically leaking
      expect(memoryDelta).toBeLessThan(100); // Less than 100MB increase
    });
  });
});
