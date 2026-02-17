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

  it('produces delta snapshots — each section contains only its own lines', async () => {
    // Create .cast file with 3 markers, each followed by distinct content
    const castContent = createCastFileWithDistinctSections();
    const filePath = join(tmpDir, 'session-delta.cast');
    writeFileSync(filePath, castContent);

    const markers = [
      { time: 1.0, label: 'Setup', index: 3 },
      { time: 2.0, label: 'Build', index: 28 },
      { time: 3.0, label: 'Test', index: 53 },
    ];

    const session = sessionRepo.create({
      filename: 'session-delta.cast',
      filepath: filePath,
      size_bytes: castContent.length,
      marker_count: 3,
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
    const markerSections = sections
      .filter((s) => s.type === 'marker')
      .sort((a, b) => a.start_event - b.start_event);

    expect(markerSections.length).toBe(3);

    // Parse snapshots and extract text content
    const sectionTexts = markerSections.map((s) => {
      const snapshot = JSON.parse(s.snapshot!);
      return snapshot.lines
        .map((line: { spans: { text: string }[] }) =>
          line.spans.map((span: { text: string }) => span.text).join('')
        )
        .join('\n');
    });

    // Section "Setup" should contain setup content, NOT build or test content
    expect(sectionTexts[0]).toContain('Installing dependencies');
    expect(sectionTexts[0]).not.toContain('Compiling');
    expect(sectionTexts[0]).not.toContain('PASS');

    // Section "Build" should contain build content, NOT setup or test content
    expect(sectionTexts[1]).toContain('Compiling');
    expect(sectionTexts[1]).not.toContain('Installing dependencies');
    expect(sectionTexts[1]).not.toContain('PASS');

    // Section "Test" should contain test content, NOT setup or build content
    expect(sectionTexts[2]).toContain('PASS');
    expect(sectionTexts[2]).not.toContain('Installing dependencies');
    expect(sectionTexts[2]).not.toContain('Compiling');

    // Each section should have a reasonable number of lines (not accumulated)
    for (const s of markerSections) {
      const snapshot = JSON.parse(s.snapshot!);
      expect(snapshot.lines.length).toBeGreaterThan(0);
      expect(snapshot.lines.length).toBeLessThan(30);
    }
  });

  describe('Edge Cases', () => {
    it('handles empty session (header only)', async () => {
      // Create .cast file with only header, no events
      const castContent = JSON.stringify({
        version: 3,
        width: 80,
        height: 24,
      });
      const filePath = join(tmpDir, 'empty-session.cast');
      writeFileSync(filePath, castContent);

      const session = sessionRepo.create({
        filename: 'empty-session.cast',
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

      // Should complete without error
      const updatedSession = sessionRepo.findById(session.id);
      expect(updatedSession?.detection_status).toBe('completed');
      expect(updatedSession?.event_count).toBe(0);

      // Should have no sections (below minimum threshold)
      const sections = sectionRepo.findBySessionId(session.id);
      expect(sections.length).toBe(0);
    });

    it('handles session with single event', async () => {
      // Create .cast file with header + 1 event
      const header = JSON.stringify({
        version: 3,
        width: 80,
        height: 24,
      });
      const event = JSON.stringify([0.1, 'o', 'Single line\r\n']);
      const castContent = [header, event].join('\n');
      const filePath = join(tmpDir, 'single-event.cast');
      writeFileSync(filePath, castContent);

      const session = sessionRepo.create({
        filename: 'single-event.cast',
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

      // Should complete without error
      const updatedSession = sessionRepo.findById(session.id);
      expect(updatedSession?.detection_status).toBe('completed');
      expect(updatedSession?.event_count).toBe(1);

      // Should have no sections (below minimum threshold)
      const sections = sectionRepo.findBySessionId(session.id);
      expect(sections.length).toBe(0);
    });

    it('handles Unicode content (CJK characters and emoji)', async () => {
      // Create .cast file with Unicode content
      const header = JSON.stringify({
        version: 3,
        width: 80,
        height: 24,
      });

      const events = [];
      // Add various Unicode content
      events.push(JSON.stringify([0.1, 'o', '你好世界\r\n'])); // Chinese
      events.push(JSON.stringify([0.2, 'o', 'こんにちは\r\n'])); // Japanese
      events.push(JSON.stringify([0.3, 'o', '안녕하세요\r\n'])); // Korean
      events.push(JSON.stringify([0.4, 'o', '🎉 🚀 ✨\r\n'])); // Emoji
      events.push(JSON.stringify([0.5, 'o', 'Ñoño çédille\r\n'])); // Latin extended

      // Add enough events to meet minimum threshold
      for (let i = 0; i < 195; i++) {
        events.push(JSON.stringify([0.1 + i * 0.01, 'o', `Line ${i}\r\n`]));
      }

      const castContent = [header, ...events].join('\n');
      const filePath = join(tmpDir, 'unicode-session.cast');
      writeFileSync(filePath, castContent);

      const session = sessionRepo.create({
        filename: 'unicode-session.cast',
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

      // Should complete without error
      const updatedSession = sessionRepo.findById(session.id);
      expect(updatedSession?.detection_status).toBe('completed');
      expect(updatedSession?.event_count).toBe(200);

      // If sections were created, verify snapshots don't error
      const sections = sectionRepo.findBySessionId(session.id);
      sections.forEach((section) => {
        if (section.snapshot) {
          // Should parse without error
          const snapshot = JSON.parse(section.snapshot);
          expect(snapshot.lines).toBeDefined();
        }
      });
    });
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

function createCastFileWithDistinctSections(): string {
  const header = JSON.stringify({
    version: 3,
    width: 120,
    height: 40,
  });

  const events: string[] = [];

  // Pre-marker output (events 0-2)
  events.push(JSON.stringify([0.1, 'o', '$ ci-run\r\n']));
  events.push(JSON.stringify([0.2, 'o', 'Starting CI pipeline...\r\n']));
  events.push(JSON.stringify([0.3, 'o', '\r\n']));

  // Marker "Setup" at index 3
  events.push(JSON.stringify([1.0, 'm', 'Setup']));

  // Setup content (events 4-27): 24 events with distinct "setup" text
  for (let i = 0; i < 24; i++) {
    events.push(JSON.stringify([1.0 + i * 0.01, 'o', `Installing dependencies (${i + 1}/24)...\r\n`]));
  }

  // Marker "Build" at index 28
  events.push(JSON.stringify([2.0, 'm', 'Build']));

  // Build content (events 29-52): 24 events with distinct "build" text
  for (let i = 0; i < 24; i++) {
    events.push(JSON.stringify([2.0 + i * 0.01, 'o', `Compiling module ${i + 1} of 24...\r\n`]));
  }

  // Marker "Test" at index 53
  events.push(JSON.stringify([3.0, 'm', 'Test']));

  // Test content (events 54-77): 24 events with distinct "test" text
  for (let i = 0; i < 24; i++) {
    events.push(JSON.stringify([3.0 + i * 0.01, 'o', `  PASS  test-suite-${i + 1}.ts (${i + 2}ms)\r\n`]));
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
