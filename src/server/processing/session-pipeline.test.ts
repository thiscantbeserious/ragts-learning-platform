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

  it('creates marker-type sections with line ranges (CLI session)', async () => {
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

    // First marker section - CLI section should have line ranges, not snapshot
    expect(markerSections[0].label).toBe('Start');
    expect(markerSections[0].start_event).toBe(50);
    expect(markerSections[0].snapshot).toBe(null);
    expect(markerSections[0].start_line).toBeTypeOf('number');
    expect(markerSections[0].end_line).toBeTypeOf('number');

    // Second marker section
    expect(markerSections[1].label).toBe('Middle');
    expect(markerSections[1].start_event).toBe(100);
    expect(markerSections[1].snapshot).toBe(null);
    expect(markerSections[1].start_line).toBeTypeOf('number');
    expect(markerSections[1].end_line).toBeTypeOf('number');

    // Verify session has full snapshot
    const updatedSession = sessionRepo.findById(session.id);
    expect(updatedSession?.snapshot).toBeTruthy();
    const fullSnapshot = JSON.parse(updatedSession!.snapshot!);
    expect(fullSnapshot.lines).toBeDefined();
  });

  it('creates detected-type sections with line ranges (CLI session)', async () => {
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

    // Verify line ranges exist (CLI section), not snapshot
    const firstDetected = detectedSections[0];
    expect(firstDetected.snapshot).toBe(null);
    expect(firstDetected.start_line).toBeTypeOf('number');
    expect(firstDetected.end_line).toBeTypeOf('number');

    // Verify session has full snapshot
    const updatedSession = sessionRepo.findById(session.id);
    expect(updatedSession?.snapshot).toBeTruthy();
    const fullSnapshot = JSON.parse(updatedSession!.snapshot!);
    expect(fullSnapshot.lines).toBeDefined();
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

  it('handles CLI sections with screen clears — line ranges track document state', async () => {
    // Create .cast file with 3 markers, each followed by screen clear and distinct content.
    const castContent = createCastFileWithDistinctSections();
    const filePath = join(tmpDir, 'session-delta.cast');
    writeFileSync(filePath, castContent);

    const markers = [
      { time: 1.0, label: 'Setup', index: 3 },
      { time: 2.0, label: 'Build', index: 29 },
      { time: 3.0, label: 'Test', index: 55 },
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
    const sortedSections = sections.sort((a, b) => a.start_event - b.start_event);

    // 4 sections: preamble (detected) + 3 markers
    expect(sortedSections.length).toBe(4);

    // First section is preamble (detected type)
    expect(sortedSections[0].type).toBe('detected');
    expect(sortedSections[0].label).toBe('Preamble');
    expect(sortedSections[0].start_event).toBe(0);

    const markerSections = sortedSections.filter((s) => s.type === 'marker');
    expect(markerSections.length).toBe(3);

    // Verify session has full snapshot
    const updatedSession = sessionRepo.findById(session.id);
    expect(updatedSession?.snapshot).toBeTruthy();
    const fullSnapshot = JSON.parse(updatedSession!.snapshot!);
    expect(fullSnapshot.lines).toBeDefined();

    // Screen clears cause getAllLines() to not grow. When the line count plateaus,
    // the pipeline falls back to capturing viewport snapshots for those sections.
    // This is correct: the screen-cleared content is gone from the document,
    // so a viewport capture preserves what was visible at that moment.
    for (const s of sortedSections) {
      // Each section has EITHER line ranges OR a viewport snapshot
      const hasLineRange = s.start_line !== null && s.end_line !== null;
      const hasSnapshot = s.snapshot !== null;
      expect(hasLineRange || hasSnapshot).toBe(true);
    }

    // Sections with line ranges should be non-overlapping and monotonic
    const rangedSections = sortedSections.filter(s => s.start_line !== null && s.end_line !== null);
    for (let i = 0; i < rangedSections.length - 1; i++) {
      expect(rangedSections[i].end_line).toBeLessThanOrEqual(rangedSections[i + 1].start_line);
    }

    // Sections with viewport snapshots should have valid snapshot data
    const snapshotSections = sortedSections.filter(s => s.snapshot !== null);
    for (const s of snapshotSections) {
      const snap = JSON.parse(s.snapshot!);
      expect(snap.lines).toBeDefined();
      expect(snap.lines.length).toBeGreaterThan(0);
    }
  });

  it('TUI sections get viewport snapshot, CLI sections get line ranges', async () => {
    // Create .cast file with mixed CLI/TUI content using alt-screen transitions
    // Use markers to force section boundaries (not relying on auto-detection)
    const { content: castContent, markers } = createMixedCastFileWithMarkers();
    const filePath = join(tmpDir, 'mixed-cli-tui.cast');
    writeFileSync(filePath, castContent);

    const session = sessionRepo.create({
      filename: 'mixed-cli-tui.cast',
      filepath: filePath,
      size_bytes: castContent.length,
      marker_count: markers.length,
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

    // Should have sections (preamble + 3 markers)
    expect(sortedSections.length).toBeGreaterThan(0);

    // Find the TUI section (should have a snapshot and null line ranges)
    // The TUI section will be the one captured during alt-screen mode
    const tuiSections = sortedSections.filter(s => s.snapshot !== null);
    expect(tuiSections.length).toBeGreaterThan(0);

    // Verify TUI section has snapshot and no line ranges
    const tuiSection = tuiSections[0];
    expect(tuiSection.snapshot).toBeTruthy();
    expect(tuiSection.start_line).toBe(null);
    expect(tuiSection.end_line).toBe(null);

    // Parse TUI snapshot to verify it's valid
    const tuiSnapshot = JSON.parse(tuiSection.snapshot!);
    expect(tuiSnapshot.lines).toBeDefined();
    expect(Array.isArray(tuiSnapshot.lines)).toBe(true);

    // Verify CLI sections have line ranges and no snapshots
    const cliSections = sortedSections.filter(s => s.snapshot === null);
    expect(cliSections.length).toBeGreaterThan(0);

    for (const cliSection of cliSections) {
      expect(cliSection.snapshot).toBe(null);
      expect(cliSection.start_line).toBeTypeOf('number');
      expect(cliSection.end_line).toBeTypeOf('number');
    }

    // Verify session has a non-null snapshot (full document)
    const updatedSession = sessionRepo.findById(session.id);
    expect(updatedSession?.snapshot).toBeTruthy();

    // Parse session snapshot
    const sessionSnapshot = JSON.parse(updatedSession!.snapshot!);
    expect(sessionSnapshot.lines).toBeDefined();

    // Session snapshot should NOT contain TUI content (alt-screen content disappears after exit)
    // TUI content is only in the section's viewport snapshot
    const sessionText = sessionSnapshot.lines.map((l: any) =>
      l.spans?.map((s: any) => s.text).join('') || ''
    ).join('');
    expect(sessionText).not.toContain('TUI Application');
  });

  it('session snapshot contains full scrollback document', async () => {
    // Use the existing CLI test fixture
    const castContent = createCastFileWithMarkers();
    const filePath = join(tmpDir, 'session-full-snapshot.cast');
    writeFileSync(filePath, castContent);

    const markers = [
      { time: 1.0, label: 'Start', index: 50 },
      { time: 2.0, label: 'Middle', index: 100 },
    ];

    const session = sessionRepo.create({
      filename: 'session-full-snapshot.cast',
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

    // Verify session has non-null snapshot
    const updatedSession = sessionRepo.findById(session.id);
    expect(updatedSession?.snapshot).toBeTruthy();

    // Parse and verify it has lines array
    const fullSnapshot = JSON.parse(updatedSession!.snapshot!);
    expect(fullSnapshot.lines).toBeDefined();
    expect(Array.isArray(fullSnapshot.lines)).toBe(true);
    expect(fullSnapshot.lines.length).toBeGreaterThan(0);

    // Verify the lines contain expected content from the session
    const allText = fullSnapshot.lines.map((l: any) =>
      l.spans?.map((s: any) => s.text).join('') || ''
    ).join('');
    expect(allText).toContain('Line'); // Our test fixture generates "Line X" content

    // Verify section line ranges correctly slice the session snapshot
    const sections = sectionRepo.findBySessionId(session.id);
    for (const section of sections) {
      if (section.start_line !== null && section.end_line !== null) {
        const sectionLines = fullSnapshot.lines.slice(section.start_line, section.end_line);
        expect(sectionLines).toBeDefined();
        expect(Array.isArray(sectionLines)).toBe(true);
      }
    }
  });

  it('CLI section line ranges are contiguous and non-overlapping', async () => {
    // Create multi-section CLI session
    const castContent = createCastFileWithDistinctSections();
    const filePath = join(tmpDir, 'session-line-continuity.cast');
    writeFileSync(filePath, castContent);

    const markers = [
      { time: 1.0, label: 'Setup', index: 3 },
      { time: 2.0, label: 'Build', index: 29 },
      { time: 3.0, label: 'Test', index: 55 },
    ];

    const session = sessionRepo.create({
      filename: 'session-line-continuity.cast',
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
    const sortedSections = sections.sort((a, b) => a.start_event - b.start_event);

    // Filter to CLI sections only (those with line ranges)
    const cliSections = sortedSections.filter(s => s.start_line !== null && s.end_line !== null);
    expect(cliSections.length).toBeGreaterThan(0);

    // Sort by start_line
    const sortedByLine = cliSections.sort((a, b) => a.start_line! - b.start_line!);

    // Verify first section starts at beginning
    expect(sortedByLine[0].start_line).toBe(0);

    // Verify line ranges are contiguous (strict equality)
    for (let i = 0; i < sortedByLine.length - 1; i++) {
      const current = sortedByLine[i];
      const next = sortedByLine[i + 1];
      expect(current.end_line).toBe(next.start_line);
    }

    // Verify last section's end_line doesn't exceed full snapshot length
    const updatedSession = sessionRepo.findById(session.id);
    const fullSnapshot = JSON.parse(updatedSession!.snapshot!);
    const lastSection = sortedByLine[sortedByLine.length - 1];
    expect(lastSection.end_line).toBeLessThanOrEqual(fullSnapshot.lines.length);
  });

  it('session with no detected boundaries still gets full snapshot', async () => {
    // Create a very short .cast file with no timing gaps or screen clears
    const castContent = createShortCastFile();
    const filePath = join(tmpDir, 'session-no-boundaries.cast');
    writeFileSync(filePath, castContent);

    const session = sessionRepo.create({
      filename: 'session-no-boundaries.cast',
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

    // Verify no sections were created
    const sections = sectionRepo.findBySessionId(session.id);
    expect(sections.length).toBe(0);

    // Verify session has non-null snapshot
    const updatedSession = sessionRepo.findById(session.id);
    expect(updatedSession?.snapshot).toBeTruthy();

    // Parse and verify it contains the output
    const fullSnapshot = JSON.parse(updatedSession!.snapshot!);
    expect(fullSnapshot.lines).toBeDefined();
    expect(Array.isArray(fullSnapshot.lines)).toBe(true);
    expect(fullSnapshot.lines.length).toBeGreaterThan(0);

    // Verify content is present
    const allText = fullSnapshot.lines.map((l: any) =>
      l.spans?.map((s: any) => s.text).join('') || ''
    ).join('');
    expect(allText).toContain('hello world');
  });

  describe('Edge Cases', () => {
    it('handles empty session (header only)', async () => {
      // Create .cast file with only header, no events
      const castContent = JSON.stringify({
        version: 3,
        term: { cols: 80, rows: 24 },
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
        term: { cols: 80, rows: 24 },
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
        term: { cols: 80, rows: 24 },
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
    term: { cols: 80, rows: 24 },
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
    term: { cols: 80, rows: 24 },
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
    term: { cols: 120, rows: 40 },
  });

  const events: string[] = [];

  // Pre-marker output (events 0-2)
  events.push(JSON.stringify([0.1, 'o', '$ ci-run\r\n']));
  events.push(JSON.stringify([0.2, 'o', 'Starting CI pipeline...\r\n']));
  events.push(JSON.stringify([0.3, 'o', '\r\n']));

  // Marker "Setup" at index 3, followed by screen clear
  events.push(JSON.stringify([1.0, 'm', 'Setup']));
  events.push(JSON.stringify([1.0, 'o', '\x1b[2J\x1b[H']));

  // Setup content (events 5-28): 24 events with distinct "setup" text
  for (let i = 0; i < 24; i++) {
    events.push(JSON.stringify([1.0 + i * 0.01, 'o', `Installing dependencies (${i + 1}/24)...\r\n`]));
  }

  // Marker "Build" at index 29, followed by screen clear
  events.push(JSON.stringify([2.0, 'm', 'Build']));
  events.push(JSON.stringify([2.0, 'o', '\x1b[2J\x1b[H']));

  // Build content (events 31-54): 24 events with distinct "build" text
  for (let i = 0; i < 24; i++) {
    events.push(JSON.stringify([2.0 + i * 0.01, 'o', `Compiling module ${i + 1} of 24...\r\n`]));
  }

  // Marker "Test" at index 55, followed by screen clear
  events.push(JSON.stringify([3.0, 'm', 'Test']));
  events.push(JSON.stringify([3.0, 'o', '\x1b[2J\x1b[H']));

  // Test content (events 57-80): 24 events with distinct "test" text
  for (let i = 0; i < 24; i++) {
    events.push(JSON.stringify([3.0 + i * 0.01, 'o', `  PASS  test-suite-${i + 1}.ts (${i + 2}ms)\r\n`]));
  }

  return [header, ...events].join('\n');
}

function createCastFileWithScreenClear(): string {
  const header = JSON.stringify({
    version: 3,
    term: { cols: 80, rows: 24 },
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

/**
 * Helper to create a mixed CLI/TUI cast file with alt-screen transitions and markers.
 * Tests the hybrid snapshot model: CLI sections get line ranges, TUI sections get viewport snapshots.
 */
function createMixedCastFileWithMarkers(): { content: string; markers: { time: number; label: string; index: number }[] } {
  const header = JSON.stringify({
    version: 3,
    term: { cols: 80, rows: 24 },
  });

  const events: string[] = [];
  const markers: { time: number; label: string; index: number }[] = [];
  let t = 0;
  let eventIndex = 0;

  // CLI section: normal terminal output
  events.push(JSON.stringify([t += 0.01, 'o', '$ ls\r\n']));
  eventIndex++;
  events.push(JSON.stringify([t += 0.01, 'o', 'file1.txt  file2.txt\r\n']));
  eventIndex++;
  events.push(JSON.stringify([t += 0.01, 'o', '$ vim main.rs\r\n']));
  eventIndex++;

  // Marker: entering vim (which will use alt-screen)
  markers.push({ time: t, label: 'Edit File', index: eventIndex });
  events.push(JSON.stringify([t, 'm', 'Edit File']));
  eventIndex++;

  // TUI section: enter alt screen, draw TUI content
  events.push(JSON.stringify([t += 0.01, 'o', '\x1b[?1049h']));  // Enter alt screen
  eventIndex++;
  events.push(JSON.stringify([t += 0.01, 'o', '\x1b[H\x1b[2J']));  // Clear screen
  eventIndex++;
  events.push(JSON.stringify([t += 0.01, 'o', 'TUI Application v1.0\r\n']));
  eventIndex++;
  events.push(JSON.stringify([t += 0.01, 'o', '━━━━━━━━━━━━━━━━━━━━━━\r\n']));
  eventIndex++;
  events.push(JSON.stringify([t += 0.01, 'o', '\r\n']));
  eventIndex++;
  events.push(JSON.stringify([t += 0.01, 'o', '> Option 1\r\n']));
  eventIndex++;
  events.push(JSON.stringify([t += 0.01, 'o', '  Option 2\r\n']));
  eventIndex++;
  events.push(JSON.stringify([t += 0.01, 'o', '  Option 3\r\n']));
  eventIndex++;

  // Marker: exiting vim
  markers.push({ time: t, label: 'Exit Editor', index: eventIndex });
  events.push(JSON.stringify([t, 'm', 'Exit Editor']));
  eventIndex++;

  // Exit alt screen back to CLI
  events.push(JSON.stringify([t += 0.01, 'o', '\x1b[?1049l']));  // Exit alt screen
  eventIndex++;
  events.push(JSON.stringify([t += 0.01, 'o', '$ cargo build\r\n']));
  eventIndex++;
  events.push(JSON.stringify([t += 0.01, 'o', 'Compiling...\r\n']));
  eventIndex++;
  events.push(JSON.stringify([t += 0.01, 'o', 'Finished dev target in 2.5s\r\n']));
  eventIndex++;

  // Marker: running tests
  markers.push({ time: t, label: 'Run Tests', index: eventIndex });
  events.push(JSON.stringify([t, 'm', 'Run Tests']));
  eventIndex++;

  events.push(JSON.stringify([t += 0.01, 'o', '$ cargo test\r\n']));
  eventIndex++;
  events.push(JSON.stringify([t += 0.01, 'o', 'running 5 tests\r\n']));
  eventIndex++;
  events.push(JSON.stringify([t += 0.01, 'o', 'test result: ok. 5 passed\r\n']));
  eventIndex++;

  return {
    content: [header, ...events].join('\n'),
    markers,
  };
}

/**
 * Helper to create a very short .cast file with no detectable boundaries.
 * Tests that sessions without sections still get a full snapshot.
 */
function createShortCastFile(): string {
  const header = JSON.stringify({
    version: 3,
    term: { cols: 80, rows: 24 },
  });

  const events: string[] = [];
  // Just a few events with no timing gaps or screen clears
  events.push(JSON.stringify([0.1, 'o', '$ echo hello world\r\n']));
  events.push(JSON.stringify([0.15, 'o', 'hello world\r\n']));
  events.push(JSON.stringify([0.2, 'o', '$ ']));

  return [header, ...events].join('\n');
}
