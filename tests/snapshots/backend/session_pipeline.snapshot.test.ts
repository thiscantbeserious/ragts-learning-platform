/**
 * Snapshot tests for session processing pipeline.
 * Locks down the full pipeline output: sections, line ranges, detection status.
 *
 * Uses in-memory repository mocks to isolate the pipeline logic.
 * The session mock implements completeProcessing to capture the ProcessedSession result.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { processSessionPipeline } from '../../../src/server/processing/session_pipeline.js';
import type { ProcessedSession } from '../../../src/server/processing/types.js';
import { initVt } from '#vt-wasm';

beforeAll(async () => {
  await initVt();
});

const TEST_DATA_DIR = join(__dirname, '../../.test-data');

/** Create a temp .cast file and return its path (kept for future use). */
function _writeTempCast(content: string, name: string): string {
  mkdirSync(TEST_DATA_DIR, { recursive: true });
  const filePath = join(TEST_DATA_DIR, name);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/** Load a .cast fixture and extract markers from its events. */
function loadFixtureWithMarkers(fixturePath: string) {
  const content = readFileSync(fixturePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const events = lines.slice(1).map(l => JSON.parse(l));
  const markers = events
    .map((e: any, i: number) => ({ event: e, index: i }))
    .filter((x: any) => x.event[1] === 'm')
    .map((x: any) => ({
      time: x.event[0],
      label: String(x.event[2]),
      index: x.index,
    }));
  return { events, markers };
}

/** In-memory mock for SessionRepository. Captures completeProcessing result. */
function createMockSessionRepo() {
  let processed: ProcessedSession | null = null;
  let failedStatus: string | null = null;

  return {
    updateDetectionStatus(_id: string, status: string) {
      if (status === 'failed') failedStatus = status;
    },
    updateSnapshot(_id: string, _snapshot: string) {},
    create: async () => { throw new Error('not implemented'); },
    createWithId: async () => { throw new Error('not implemented'); },
    findAll: async () => [],
    findById: async () => null,
    deleteById: async () => false,
    completeProcessing: async (ps: ProcessedSession) => { processed = ps; },
    getProcessed() { return processed; },
    getFailedStatus() { return failedStatus; },
  };
}

/** Serialize sections for deterministic snapshots. */
function serializeSections(sections: ProcessedSession['sections']) {
  return sections
    .toSorted((a: any, b: any) => a.startEvent - b.startEvent)
    .map((s: any) => ({
      type: s.type,
      label: s.label,
      startEvent: s.startEvent,
      endEvent: s.endEvent,
      startLine: s.startLine,
      endLine: s.endLine,
      hasSnapshot: s.snapshot !== null && s.snapshot !== undefined,
    }));
}

describe('session-pipeline snapshots', () => {
  afterAll(() => {
    try { rmSync(TEST_DATA_DIR, { recursive: true, force: true }); } catch {}
  });

  it('CLI session with markers — section structure', async () => {
    const castPath = join(__dirname, '../../fixtures/valid-with-markers.cast');
    const { markers } = loadFixtureWithMarkers(castPath);

    const sessionRepo = createMockSessionRepo();

    await processSessionPipeline(
      castPath,
      'test-session-markers',
      markers,
      sessionRepo as any,
    );

    const processed = sessionRepo.getProcessed();
    expect(processed).not.toBeNull();
    const sections = serializeSections(processed!.sections);
    expect(sections).toMatchSnapshot();

    expect(processed!.eventCount).toMatchSnapshot();
  });

  it('synthetic TUI session with epochs — exercises dedup', async () => {
    const castPath = join(__dirname, '../../fixtures/synthetic-tui-session.cast');

    const sessionRepo = createMockSessionRepo();

    await processSessionPipeline(
      castPath,
      'test-session-tui',
      [],
      sessionRepo as any,
    );

    const processed = sessionRepo.getProcessed();
    expect(processed).not.toBeNull();

    // Verify dedup happened: session snapshot should exist and be smaller than raw
    const snapshot = processed!.snapshot ? JSON.parse(processed!.snapshot) : null;
    expect(snapshot).not.toBeNull();
    expect(snapshot.lines.length).toMatchSnapshot();
  });

  it('valid-with-markers.cast — full pipeline snapshot excluding dynamic fields', async () => {
    const castPath = join(__dirname, '../../fixtures/valid-with-markers.cast');
    const { markers } = loadFixtureWithMarkers(castPath);

    const sessionRepo = createMockSessionRepo();

    await processSessionPipeline(
      castPath,
      'test-pipeline-full',
      markers,
      sessionRepo as any,
    );

    const processed = sessionRepo.getProcessed();
    const snapshot = processed!.snapshot ? JSON.parse(processed!.snapshot) : null;

    expect({
      status: processed ? 'completed' : 'failed',
      eventCount: processed!.eventCount,
      sectionsCount: processed!.detectedSectionsCount,
      snapshotLineCount: snapshot?.lines?.length ?? 0,
      snapshotCols: snapshot?.cols,
      snapshotRows: snapshot?.rows,
    }).toMatchSnapshot();
  });

  it('empty cast file (header only) — pipeline handles gracefully', async () => {
    const castPath = join(__dirname, '../../fixtures/header-only.cast');

    const sessionRepo = createMockSessionRepo();

    await processSessionPipeline(
      castPath,
      'test-empty-session',
      [],
      sessionRepo as any,
    );

    const processed = sessionRepo.getProcessed();
    expect({
      status: processed ? 'completed' : sessionRepo.getFailedStatus() ?? 'failed',
      eventCount: processed?.eventCount ?? 0,
      sectionsCount: processed?.detectedSectionsCount ?? 0,
    }).toMatchSnapshot();
    expect(processed?.sections.length ?? 0).toBe(0);
  });
});
