// @vitest-environment node
/**
 * Tests for extracted pipeline stage functions.
 * Tests behavior — correct output, error conditions, idempotency.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { initVt } from '#vt-wasm';
import { validate } from './validate.js';
import { detect } from './detect.js';
import { replay } from './replay.js';
import { dedup } from './dedup.js';
import { store } from './store.js';
import { SqliteDatabaseImpl } from '../../db/sqlite/sqlite_database_impl.js';
import type { DatabaseContext } from '../../db/database_adapter.js';
import type { AsciicastEvent, AsciicastHeader } from '../../../shared/asciicast-types.js';
import type { SectionBoundary } from '../section_detector.js';

// --- Helpers ---

function buildShortCast(): string {
  const header = JSON.stringify({ version: 3, term: { cols: 80, rows: 24 } });
  return [
    header,
    JSON.stringify([0.1, 'o', '$ echo hello\r\n']),
    JSON.stringify([0.15, 'o', 'hello\r\n']),
    JSON.stringify([0.2, 'o', '$ ']),
  ].join('\n');
}

function buildMarkerCast(): string {
  const header = JSON.stringify({ version: 3, term: { cols: 80, rows: 24 } });
  const events: string[] = [];
  for (let i = 0; i < 30; i++) {
    if (i === 10) {
      events.push(JSON.stringify([1.0, 'm', 'Start']));
    } else if (i === 20) {
      events.push(JSON.stringify([2.0, 'm', 'End']));
    } else {
      events.push(JSON.stringify([0.1 * i, 'o', `Output line ${i}\r\n`]));
    }
  }
  return [header, ...events].join('\n');
}

describe('validate stage', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'stage-validate-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns header, events, markers, and eventCount for valid .cast file', async () => {
    const content = buildMarkerCast();
    const filePath = join(tmpDir, 'session.cast');
    writeFileSync(filePath, content);

    const result = await validate(filePath, 'session1');

    expect(result.header).toBeTruthy();
    expect(result.header.width).toBe(80);
    expect(result.header.height).toBe(24);
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.markers).toBeInstanceOf(Array);
    expect(result.eventCount).toBe(result.events.length);
  });

  it('is idempotent — running twice returns same result', async () => {
    const content = buildShortCast();
    const filePath = join(tmpDir, 'session2.cast');
    writeFileSync(filePath, content);

    const r1 = await validate(filePath, 'session2');
    const r2 = await validate(filePath, 'session2');

    expect(r1.eventCount).toBe(r2.eventCount);
    expect(r1.header.width).toBe(r2.header.width);
  });

  it('throws when file does not exist', async () => {
    await expect(validate('/nonexistent/missing.cast', 's1')).rejects.toThrow();
  });

  it('extracts markers from marker events', async () => {
    const content = buildMarkerCast();
    const filePath = join(tmpDir, 'markers.cast');
    writeFileSync(filePath, content);

    const result = await validate(filePath, 'session-markers');
    expect(result.markers.length).toBe(2);
    expect(result.markers[0]!.label).toBe('Start');
    expect(result.markers[1]!.label).toBe('End');
  });
});

describe('detect stage', () => {
  it('returns boundaries array for events with markers', async () => {
    const content = buildMarkerCast();
    const lines = content.split('\n').slice(1);
    const events = lines.map(l => JSON.parse(l) as AsciicastEvent);
    const markers = [
      { time: 1.0, label: 'Start', index: 10 },
      { time: 2.0, label: 'End', index: 20 },
    ];

    const result = detect(events, markers);

    expect(result.boundaries).toBeInstanceOf(Array);
    expect(result.sectionCount).toBeGreaterThan(0);
    expect(result.boundaries.some(b => b.label === 'Start')).toBe(true);
    expect(result.boundaries.some(b => b.label === 'End')).toBe(true);
  });

  it('returns empty boundaries for short session with no detectable sections', () => {
    const content = buildShortCast();
    const lines = content.split('\n').slice(1);
    const events = lines.map(l => JSON.parse(l) as AsciicastEvent);

    const result = detect(events, []);

    expect(result.boundaries).toBeInstanceOf(Array);
    expect(result.sectionCount).toBe(result.boundaries.length);
  });

  it('is idempotent — same input produces same output', () => {
    const content = buildMarkerCast();
    const lines = content.split('\n').slice(1);
    const events = lines.map(l => JSON.parse(l) as AsciicastEvent);
    const markers = [
      { time: 1.0, label: 'Start', index: 10 },
      { time: 2.0, label: 'End', index: 20 },
    ];

    const r1 = detect(events, markers);
    const r2 = detect(events, markers);

    expect(r1.sectionCount).toBe(r2.sectionCount);
    expect(r1.boundaries.length).toBe(r2.boundaries.length);
  });
});

describe('replay stage', () => {
  beforeEach(async () => {
    await initVt();
  });

  it('returns rawSnapshot, sectionData, and epochBoundaries', () => {
    const content = buildShortCast();
    const headerRaw = JSON.parse(content.split('\n')[0]!) as { term: { cols: number; rows: number } };
    const header: AsciicastHeader = { version: 3, width: headerRaw.term.cols, height: headerRaw.term.rows };
    const lines = content.split('\n').slice(1);
    const events = lines.map(l => JSON.parse(l) as AsciicastEvent);

    const result = replay(header, events, []);

    expect(result.rawSnapshot).toBeTruthy();
    expect(result.rawSnapshot.lines).toBeInstanceOf(Array);
    expect(result.sectionData).toBeInstanceOf(Array);
    expect(result.epochBoundaries).toBeInstanceOf(Array);
  });

  it('is idempotent — same input produces same line count', () => {
    const content = buildShortCast();
    const header: AsciicastHeader = { version: 3, width: 80, height: 24 };
    const lines = content.split('\n').slice(1);
    const events = lines.map(l => JSON.parse(l) as AsciicastEvent);

    const r1 = replay(header, events, []);
    const r2 = replay(header, events, []);

    expect(r1.rawSnapshot.lines.length).toBe(r2.rawSnapshot.lines.length);
  });
});

describe('dedup stage', () => {
  beforeEach(async () => {
    await initVt();
  });

  it('returns a ProcessedSession from replay data', () => {
    const content = buildShortCast();
    const header: AsciicastHeader = { version: 3, width: 80, height: 24 };
    const lines = content.split('\n').slice(1);
    const events = lines.map(l => JSON.parse(l) as AsciicastEvent);

    const replayResult = replay(header, events, []);
    const boundaries: SectionBoundary[] = [];
    const result = dedup(
      'session-id',
      replayResult.rawSnapshot,
      replayResult.sectionData,
      replayResult.epochBoundaries,
      boundaries,
      events.length
    );

    expect(result.sessionId).toBe('session-id');
    expect(result.snapshot).toBeTruthy();
    expect(result.sections).toBeInstanceOf(Array);
    expect(result.eventCount).toBe(events.length);
  });

  it('is idempotent — same input produces same snapshot', () => {
    const content = buildShortCast();
    const header: AsciicastHeader = { version: 3, width: 80, height: 24 };
    const lines = content.split('\n').slice(1);
    const events = lines.map(l => JSON.parse(l) as AsciicastEvent);

    const replayResult = replay(header, events, []);
    const r1 = dedup('s1', replayResult.rawSnapshot, replayResult.sectionData, replayResult.epochBoundaries, [], events.length);
    const r2 = dedup('s1', replayResult.rawSnapshot, replayResult.sectionData, replayResult.epochBoundaries, [], events.length);

    expect(r1.snapshot).toBe(r2.snapshot);
    expect(r1.sections.length).toBe(r2.sections.length);
  });
});

describe('store stage', () => {
  let tmpDir: string;
  let ctx: DatabaseContext;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'stage-store-'));
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: tmpDir });
  });

  afterEach(async () => {
    await ctx.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('persists a ProcessedSession via sessionRepository.completeProcessing', async () => {
    const session = await ctx.sessionRepository.create({
      filename: 'store-test.cast',
      filepath: 'sessions/store-test.cast',
      size_bytes: 100,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    const processed = {
      sessionId: session.id,
      snapshot: JSON.stringify({ lines: [] }),
      sections: [],
      eventCount: 3,
      detectedSectionsCount: 0,
    };

    await store(processed, ctx.sessionRepository);

    const updated = await ctx.sessionRepository.findById(session.id);
    expect(updated!.detection_status).toBe('completed');
    expect(updated!.event_count).toBe(3);
  });

  it('is idempotent — calling store twice leaves session in completed state', async () => {
    const session = await ctx.sessionRepository.create({
      filename: 'store-idem.cast',
      filepath: 'sessions/store-idem.cast',
      size_bytes: 100,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    const processed = {
      sessionId: session.id,
      snapshot: JSON.stringify({ lines: [] }),
      sections: [],
      eventCount: 3,
      detectedSectionsCount: 0,
    };

    await store(processed, ctx.sessionRepository);
    await store(processed, ctx.sessionRepository);

    const updated = await ctx.sessionRepository.findById(session.id);
    expect(updated!.detection_status).toBe('completed');
  });
});
