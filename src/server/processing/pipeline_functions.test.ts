// @vitest-environment node
/**
 * Tests for extracted pipeline functions:
 * readCastFile, detectBoundaries, buildProcessedSession, and WASM cleanup in replaySession.
 *
 * These functions are module-private; we test their behavior through the exported
 * processSessionPipeline where direct access isn't possible, and via controlled integration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SqliteDatabaseImpl } from '../db/sqlite/sqlite_database_impl.js';
import type { DatabaseContext } from '../db/database_adapter.js';
import type { SessionAdapter } from '../db/session_adapter.js';
import { processSessionPipeline } from './session_pipeline.js';
import { initVt } from '#vt-wasm';
import type { ProcessedSession } from './types.js';

/**
 * Creates a session adapter that delegates to a real adapter but intercepts completeProcessing.
 * Uses Object.create to properly inherit prototype methods.
 */
function createCapturingSessionRepo(
  real: SessionAdapter,
  onComplete: (ps: ProcessedSession) => void
): SessionAdapter {
  return {
    create: (data) => real.create(data),
    createWithId: (id, data) => real.createWithId(id, data),
    findAll: () => real.findAll(),
    findById: (id) => real.findById(id),
    deleteById: (id) => real.deleteById(id),
    updateDetectionStatus: (...args) => real.updateDetectionStatus(...args),
    updateSnapshot: (id, snapshot) => real.updateSnapshot(id, snapshot),
    completeProcessing: async (ps) => {
      onComplete(ps);
      return real.completeProcessing(ps);
    },
  };
}

describe('processSessionPipeline — produces correct ProcessedSession via completeProcessing', () => {
  let tmpDir: string;
  let ctx: DatabaseContext;
  let sessionRepo: SessionAdapter;

  beforeEach(async () => {
    await initVt();
    tmpDir = mkdtempSync(join(tmpdir(), 'ragts-pipeline-fn-test-'));
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: tmpDir });
    sessionRepo = ctx.sessionRepository;
  });

  afterEach(async () => {
    await ctx.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('calls completeProcessing with correct section structure for marker session', async () => {
    let captured: ProcessedSession | null = null;
    const mockRepo = createCapturingSessionRepo(sessionRepo, ps => { captured = ps; });

    const castContent = buildMarkerCastFile();
    const filePath = join(tmpDir, 'markers.cast');
    writeFileSync(filePath, castContent);

    const session = await sessionRepo.create({
      filename: 'markers.cast',
      filepath: filePath,
      size_bytes: castContent.length,
      marker_count: 2,
      uploaded_at: new Date().toISOString(),
    });

    await processSessionPipeline(
      filePath,
      session.id,
      [{ time: 1.0, label: 'Start', index: 10 }, { time: 2.0, label: 'End', index: 20 }],
      mockRepo
    );

    expect(captured).not.toBeNull();
    expect(captured!.sessionId).toBe(session.id);
    expect(captured!.eventCount).toBeGreaterThan(0);
    expect(captured!.snapshot).toBeTruthy();
    // 2 marker sections + possible preamble
    expect(captured!.sections.length).toBeGreaterThanOrEqual(2);
    const markerSections = captured!.sections.filter(s => s.type === 'marker');
    expect(markerSections.length).toBe(2);
    expect(markerSections[0].label).toBe('Start');
    expect(markerSections[1].label).toBe('End');
  });

  it('calls completeProcessing with zero sections for event-count-below-threshold file', async () => {
    let captured: ProcessedSession | null = null;
    const mockRepo = createCapturingSessionRepo(sessionRepo, ps => { captured = ps; });

    const castContent = buildShortCastFile();
    const filePath = join(tmpDir, 'short.cast');
    writeFileSync(filePath, castContent);

    const session = await sessionRepo.create({
      filename: 'short.cast',
      filepath: filePath,
      size_bytes: castContent.length,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    await processSessionPipeline(filePath, session.id, [], mockRepo);

    expect(captured).not.toBeNull();
    expect(captured!.sections.length).toBe(0);
    expect(captured!.eventCount).toBe(3);
  });

  it('detectedSectionsCount excludes marker-type sections', async () => {
    let captured: ProcessedSession | null = null;
    const mockRepo = createCapturingSessionRepo(sessionRepo, ps => { captured = ps; });

    const castContent = buildMarkerCastFile();
    const filePath = join(tmpDir, 'markers2.cast');
    writeFileSync(filePath, castContent);

    const session = await sessionRepo.create({
      filename: 'markers2.cast',
      filepath: filePath,
      size_bytes: castContent.length,
      marker_count: 2,
      uploaded_at: new Date().toISOString(),
    });

    await processSessionPipeline(
      filePath,
      session.id,
      [{ time: 1.0, label: 'Alpha', index: 10 }, { time: 2.0, label: 'Beta', index: 20 }],
      mockRepo
    );

    expect(captured).not.toBeNull();
    // detectedSectionsCount should only count non-marker sections
    const nonMarkerCount = captured!.sections.filter(s => s.type !== 'marker').length;
    expect(captured!.detectedSectionsCount).toBe(nonMarkerCount);
  });

  it('section endEvent matches next section startEvent', async () => {
    let captured: ProcessedSession | null = null;
    const mockRepo = createCapturingSessionRepo(sessionRepo, ps => { captured = ps; });

    const castContent = buildMarkerCastFile();
    const filePath = join(tmpDir, 'end-events.cast');
    writeFileSync(filePath, castContent);

    const session = await sessionRepo.create({
      filename: 'end-events.cast',
      filepath: filePath,
      size_bytes: castContent.length,
      marker_count: 2,
      uploaded_at: new Date().toISOString(),
    });

    await processSessionPipeline(
      filePath,
      session.id,
      [{ time: 1.0, label: 'Alpha', index: 10 }, { time: 2.0, label: 'Beta', index: 20 }],
      mockRepo
    );

    expect(captured).not.toBeNull();
    const sections = captured!.sections.sort((a, b) => a.startEvent - b.startEvent);
    for (let i = 0; i < sections.length - 1; i++) {
      expect(sections[i].endEvent).toBe(sections[i + 1].startEvent);
    }
    // Last section endEvent = total event count
    expect(sections[sections.length - 1].endEvent).toBe(captured!.eventCount);
  });
});

describe('processSessionPipeline — error on missing .cast file', () => {
  let tmpDir: string;
  let ctx: DatabaseContext;
  let sessionRepo: SessionAdapter;

  beforeEach(async () => {
    await initVt();
    tmpDir = mkdtempSync(join(tmpdir(), 'ragts-pipeline-err-test-'));
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: tmpDir });
    sessionRepo = ctx.sessionRepository;
  });

  afterEach(async () => {
    await ctx.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('sets detection_status to failed when file does not exist', async () => {
    const session = await sessionRepo.create({
      filename: 'missing.cast',
      filepath: '/nonexistent/missing.cast',
      size_bytes: 100,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    await processSessionPipeline('/nonexistent/missing.cast', session.id, [], sessionRepo);

    const updated = await sessionRepo.findById(session.id);
    expect(updated?.detection_status).toBe('failed');
  });
});

describe('processSessionPipeline — WASM resource cleanup via try/finally', () => {
  let tmpDir: string;
  let ctx: DatabaseContext;
  let sessionRepo: SessionAdapter;

  beforeEach(async () => {
    await initVt();
    tmpDir = mkdtempSync(join(tmpdir(), 'ragts-wasm-guard-test-'));
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: tmpDir });
    sessionRepo = ctx.sessionRepository;
  });

  afterEach(async () => {
    await ctx.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('pipeline completes successfully even when completeProcessing throws', async () => {
    // This tests that the WASM guard allows the pipeline to reach the error handler
    // without crashing Node.js from a leaked WASM resource.
    const castContent = buildShortCastFile();
    const filePath = join(tmpDir, 'guard.cast');
    writeFileSync(filePath, castContent);

    const session = await sessionRepo.create({
      filename: 'guard.cast',
      filepath: filePath,
      size_bytes: castContent.length,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    // Create a repo that throws on completeProcessing (simulates DB failure after replay)
    const throwingRepo: SessionAdapter = {
      create: (data) => sessionRepo.create(data),
      createWithId: (id, data) => sessionRepo.createWithId(id, data),
      findAll: () => sessionRepo.findAll(),
      findById: (id) => sessionRepo.findById(id),
      deleteById: (id) => sessionRepo.deleteById(id),
      updateDetectionStatus: (...args) => sessionRepo.updateDetectionStatus(...args),
      updateSnapshot: (id, snap) => sessionRepo.updateSnapshot(id, snap),
      completeProcessing: async () => {
        throw new Error('Simulated DB failure after VT replay');
      },
    };

    // Pipeline should not throw — error is caught internally and status set to failed
    await expect(
      processSessionPipeline(filePath, session.id, [], throwingRepo)
    ).resolves.toBeUndefined();

    // Session should be marked failed
    const updated = await sessionRepo.findById(session.id);
    expect(updated?.detection_status).toBe('failed');
  });

  it('WASM pipeline can be called repeatedly without resource leaks', async () => {
    // Run the pipeline multiple times to verify VT resources are properly freed
    // (if free() was not called, repeated runs would eventually exhaust WASM memory)
    const castContent = buildMarkerCastFile();

    for (let i = 0; i < 5; i++) {
      const filePath = join(tmpDir, `repeat-${i}.cast`);
      writeFileSync(filePath, castContent);

      const session = await sessionRepo.create({
        filename: `repeat-${i}.cast`,
        filepath: filePath,
        size_bytes: castContent.length,
        marker_count: 0,
        uploaded_at: new Date().toISOString(),
      });

      await processSessionPipeline(filePath, session.id, [], sessionRepo);

      const updated = await sessionRepo.findById(session.id);
      expect(updated?.detection_status).toBe('completed');
    }
  });
});

describe('preamble synthesis in detectBoundaries', () => {
  let tmpDir: string;
  let ctx: DatabaseContext;
  let sessionRepo: SessionAdapter;

  beforeEach(async () => {
    await initVt();
    tmpDir = mkdtempSync(join(tmpdir(), 'ragts-preamble-test-'));
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: tmpDir });
    sessionRepo = ctx.sessionRepository;
  });

  afterEach(async () => {
    await ctx.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('synthesizes preamble when markers exist and pre-marker content is present', async () => {
    let captured: ProcessedSession | null = null;
    const mockRepo = createCapturingSessionRepo(sessionRepo, ps => { captured = ps; });

    // File with pre-marker output, then a marker at index > 0
    const castContent = buildFileWithPreamble();
    const filePath = join(tmpDir, 'preamble.cast');
    writeFileSync(filePath, castContent);

    const session = await sessionRepo.create({
      filename: 'preamble.cast',
      filepath: filePath,
      size_bytes: castContent.length,
      marker_count: 1,
      uploaded_at: new Date().toISOString(),
    });

    await processSessionPipeline(
      filePath,
      session.id,
      [{ time: 1.0, label: 'Section A', index: 5 }],
      mockRepo
    );

    expect(captured).not.toBeNull();
    const preamble = captured!.sections.find(s => s.label === 'Preamble');
    expect(preamble).toBeDefined();
    expect(preamble!.startEvent).toBe(0);
  });

  it('does not synthesize preamble when first marker is at event 0', async () => {
    let captured: ProcessedSession | null = null;
    const mockRepo = createCapturingSessionRepo(sessionRepo, ps => { captured = ps; });

    const castContent = buildMarkerCastFile();
    const filePath = join(tmpDir, 'no-preamble.cast');
    writeFileSync(filePath, castContent);

    const session = await sessionRepo.create({
      filename: 'no-preamble.cast',
      filepath: filePath,
      size_bytes: castContent.length,
      marker_count: 1,
      uploaded_at: new Date().toISOString(),
    });

    // Marker at index 0 — no pre-marker content
    await processSessionPipeline(
      filePath,
      session.id,
      [{ time: 0.05, label: 'First', index: 0 }],
      mockRepo
    );

    expect(captured).not.toBeNull();
    const preamble = captured!.sections.find(s => s.label === 'Preamble');
    expect(preamble).toBeUndefined();
  });
});

// --- Helper functions ---

function buildShortCastFile(): string {
  const header = JSON.stringify({ version: 3, term: { cols: 80, rows: 24 } });
  const events = [
    JSON.stringify([0.1, 'o', '$ echo hello\r\n']),
    JSON.stringify([0.15, 'o', 'hello\r\n']),
    JSON.stringify([0.2, 'o', '$ ']),
  ];
  return [header, ...events].join('\n');
}

function buildMarkerCastFile(): string {
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

function buildFileWithPreamble(): string {
  const header = JSON.stringify({ version: 3, term: { cols: 80, rows: 24 } });
  const events: string[] = [];
  // 5 output events before the marker
  for (let i = 0; i < 5; i++) {
    events.push(JSON.stringify([0.1 * i, 'o', `Pre-marker output ${i}\r\n`]));
  }
  // Marker at index 5
  events.push(JSON.stringify([1.0, 'm', 'Section A']));
  // More output after
  for (let i = 0; i < 10; i++) {
    events.push(JSON.stringify([1.0 + 0.1 * i, 'o', `Post-marker output ${i}\r\n`]));
  }
  return [header, ...events].join('\n');
}
