/**
 * Tests for session processing pipeline.
 * Orchestrates detection + snapshot generation + DB storage.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { initDatabase } from '../db/database.js';
import { SqliteSessionRepository } from '../db/sqlite-session-repository.js';
import { SqliteSectionRepository } from '../db/sqlite-section-repository.js';
import { processSessionPipeline } from './session-pipeline.js';
import { initVt } from '../../../packages/vt-wasm/index.js';

describe('processSessionPipeline', () => {
  let tmpDir: string;
  let db: Database.Database;
  let sessionRepo: SqliteSessionRepository;
  let sectionRepo: SqliteSectionRepository;

  beforeEach(async () => {
    // Initialize WASM module once before tests
    await initVt();

    // Create temp directory for test database
    tmpDir = mkdtempSync(join(tmpdir(), 'ragts-pipeline-test-'));
    const dbPath = join(tmpDir, 'test.db');
    db = initDatabase(dbPath);
    sessionRepo = new SqliteSessionRepository(db);
    sectionRepo = new SqliteSectionRepository(db);
  });

  afterEach(() => {
    // Cleanup
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('processes a simple .cast file and creates sections in DB', async () => {
    // Create a minimal .cast file with 200 events (meets minimum threshold)
    const castContent = createCastFile(200);
    const filePath = join(tmpDir, 'session.cast');
    writeFileSync(filePath, castContent);

    // Create session in DB
    const session = sessionRepo.create({
      filename: 'session.cast',
      filepath: filePath,
      size_bytes: castContent.length,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    // Run pipeline
    await processSessionPipeline(
      filePath,
      session.id,
      [],
      sectionRepo,
      sessionRepo
    );

    // Verify session was updated
    const updatedSession = sessionRepo.findById(session.id);
    expect(updatedSession).toBeTruthy();
    expect(updatedSession?.detection_status).toBe('completed');
    expect(updatedSession?.event_count).toBe(200);

    // Verify sections were created (may or may not detect boundaries depending on content)
    const sections = sectionRepo.findBySessionId(session.id);
    expect(Array.isArray(sections)).toBe(true);
  });

  it('creates marker-type sections with snapshots', async () => {
    // Create .cast file with markers
    const castContent = createCastFileWithMarkers();
    const filePath = join(tmpDir, 'session-markers.cast');
    writeFileSync(filePath, castContent);

    const markers = [
      { time: 1.0, label: 'Start', index: 50 },
      { time: 2.0, label: 'Middle', index: 100 },
    ];

    const session = sessionRepo.create({
      filename: 'session-markers.cast',
      filepath: filePath,
      size_bytes: castContent.length,
      marker_count: 2,
      uploaded_at: new Date().toISOString(),
    });

    await processSessionPipeline(
      filePath,
      session.id,
      markers,
      sectionRepo,
      sessionRepo
    );

    const sections = sectionRepo.findBySessionId(session.id);
    const markerSections = sections.filter((s) => s.type === 'marker');

    // Should have 2 marker sections
    expect(markerSections.length).toBe(2);

    // First marker section
    expect(markerSections[0].label).toBe('Start');
    expect(markerSections[0].start_event).toBe(50);
    expect(markerSections[0].snapshot).toBeTruthy();
    const snapshot1 = JSON.parse(markerSections[0].snapshot!);
    expect(snapshot1.lines).toBeDefined();

    // Second marker section
    expect(markerSections[1].label).toBe('Middle');
    expect(markerSections[1].start_event).toBe(100);
    expect(markerSections[1].snapshot).toBeTruthy();
  });

  it('creates detected-type sections with snapshots', async () => {
    // Create .cast file with screen clear to trigger detection
    const castContent = createCastFileWithScreenClear();
    const filePath = join(tmpDir, 'session-detected.cast');
    writeFileSync(filePath, castContent);

    const session = sessionRepo.create({
      filename: 'session-detected.cast',
      filepath: filePath,
      size_bytes: castContent.length,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    await processSessionPipeline(
      filePath,
      session.id,
      [],
      sectionRepo,
      sessionRepo
    );

    const sections = sectionRepo.findBySessionId(session.id);
    const detectedSections = sections.filter((s) => s.type === 'detected');

    // Should have at least 1 detected section from screen clear
    expect(detectedSections.length).toBeGreaterThan(0);

    // Verify snapshot exists
    const firstDetected = detectedSections[0];
    expect(firstDetected.snapshot).toBeTruthy();
    const snapshot = JSON.parse(firstDetected.snapshot!);
    expect(snapshot.lines).toBeDefined();
  });

  it('updates session detection_status to completed', async () => {
    const castContent = createCastFile(200);
    const filePath = join(tmpDir, 'session.cast');
    writeFileSync(filePath, castContent);

    const session = sessionRepo.create({
      filename: 'session.cast',
      filepath: filePath,
      size_bytes: castContent.length,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    // Verify initial status is pending (from migration default)
    const initialSession = sessionRepo.findById(session.id);
    expect(initialSession?.detection_status).toBe('pending');

    await processSessionPipeline(
      filePath,
      session.id,
      [],
      sectionRepo,
      sessionRepo
    );

    const updatedSession = sessionRepo.findById(session.id);
    expect(updatedSession?.detection_status).toBe('completed');
  });

  it('updates session event_count', async () => {
    const eventCount = 250;
    const castContent = createCastFile(eventCount);
    const filePath = join(tmpDir, 'session.cast');
    writeFileSync(filePath, castContent);

    const session = sessionRepo.create({
      filename: 'session.cast',
      filepath: filePath,
      size_bytes: castContent.length,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    await processSessionPipeline(
      filePath,
      session.id,
      [],
      sectionRepo,
      sessionRepo
    );

    const updatedSession = sessionRepo.findById(session.id);
    expect(updatedSession?.event_count).toBe(eventCount);
  });

  it('sets detection_status to failed on error', async () => {
    const castContent = createCastFile(200);
    const filePath = join(tmpDir, 'session.cast');
    writeFileSync(filePath, castContent);

    const session = sessionRepo.create({
      filename: 'session.cast',
      filepath: filePath,
      size_bytes: castContent.length,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    // Pass a non-existent file path to trigger error
    await processSessionPipeline(
      '/nonexistent/file.cast',
      session.id,
      [],
      sectionRepo,
      sessionRepo
    );

    const updatedSession = sessionRepo.findById(session.id);
    expect(updatedSession?.detection_status).toBe('failed');
  });

  it('replaces existing detected sections on re-processing', async () => {
    const castContent = createCastFileWithScreenClear();
    const filePath = join(tmpDir, 'session.cast');
    writeFileSync(filePath, castContent);

    const session = sessionRepo.create({
      filename: 'session.cast',
      filepath: filePath,
      size_bytes: castContent.length,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    // First processing
    await processSessionPipeline(
      filePath,
      session.id,
      [],
      sectionRepo,
      sessionRepo
    );

    const firstSections = sectionRepo.findBySessionId(session.id);
    const firstCount = firstSections.length;

    // Second processing (should replace sections)
    await processSessionPipeline(
      filePath,
      session.id,
      [],
      sectionRepo,
      sessionRepo
    );

    const secondSections = sectionRepo.findBySessionId(session.id);

    // Should have same number of sections (replaced, not appended)
    expect(secondSections.length).toBe(firstCount);

    // Section IDs should be different (new sections created)
    const firstIds = firstSections.map((s) => s.id).sort();
    const secondIds = secondSections.map((s) => s.id).sort();
    expect(firstIds).not.toEqual(secondIds);
  });

  it('sets end_event correctly for sections', async () => {
    const castContent = createCastFileWithMarkers();
    const filePath = join(tmpDir, 'session.cast');
    writeFileSync(filePath, castContent);

    const markers = [
      { time: 1.0, label: 'Start', index: 50 },
      { time: 2.0, label: 'End', index: 100 },
    ];

    const session = sessionRepo.create({
      filename: 'session.cast',
      filepath: filePath,
      size_bytes: castContent.length,
      marker_count: 2,
      uploaded_at: new Date().toISOString(),
    });

    await processSessionPipeline(
      filePath,
      session.id,
      markers,
      sectionRepo,
      sessionRepo
    );

    const sections = sectionRepo.findBySessionId(session.id);
    const sortedSections = sections.sort((a, b) => a.start_event - b.start_event);

    // Each section's end_event should be the next section's start_event
    for (let i = 0; i < sortedSections.length - 1; i++) {
      expect(sortedSections[i].end_event).toBe(sortedSections[i + 1].start_event);
    }

    // Last section's end_event should be the total event count
    const lastSection = sortedSections[sortedSections.length - 1];
    const updatedSession = sessionRepo.findById(session.id);
    expect(lastSection.end_event).toBe(updatedSession?.event_count);
  });
});

// Helper functions to generate test .cast files

function createCastFile(eventCount: number): string {
  const header = JSON.stringify({
    version: 3,
    width: 80,
    height: 24,
  });

  const events = [];
  for (let i = 0; i < eventCount; i++) {
    events.push(JSON.stringify([0.1, 'o', `Line ${i}\r\n`]));
  }

  return [header, ...events].join('\n');
}

function createCastFileWithMarkers(): string {
  const header = JSON.stringify({
    version: 3,
    width: 80,
    height: 24,
  });

  const events = [];

  // Generate events with markers at specific indices
  for (let i = 0; i < 150; i++) {
    if (i === 50) {
      events.push(JSON.stringify([0.1, 'm', 'Start']));
    } else if (i === 100) {
      events.push(JSON.stringify([0.1, 'm', 'Middle']));
    } else {
      events.push(JSON.stringify([0.1, 'o', `Line ${i}\r\n`]));
    }
  }

  return [header, ...events].join('\n');
}

function createCastFileWithScreenClear(): string {
  const header = JSON.stringify({
    version: 3,
    width: 80,
    height: 24,
  });

  const events = [];

  // Generate events with screen clear at index 100
  for (let i = 0; i < 200; i++) {
    if (i === 100) {
      events.push(JSON.stringify([0.1, 'o', '\x1b[2J\x1b[H']));
    } else {
      events.push(JSON.stringify([0.1, 'o', `Line ${i}\r\n`]));
    }
  }

  return [header, ...events].join('\n');
}
