/**
 * Tests for v2 migration CLI.
 * Ensures existing sessions are migrated to new schema with sections and snapshots.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { initDatabase } from '../db/database.js';
import { SqliteSessionRepository } from '../db/sqlite-session-repository.js';
import { SqliteSectionRepository } from '../db/sqlite-section-repository.js';
import { migrateV2 } from './migrate-v2.js';
import { initVt } from '../../../packages/vt-wasm/index.js';

describe('migrateV2', () => {
  let tmpDir: string;
  let db: Database.Database;
  let sessionRepo: SqliteSessionRepository;
  let sectionRepo: SqliteSectionRepository;

  beforeEach(async () => {
    // Initialize WASM module once before tests
    await initVt();

    // Create temp directory for test database
    tmpDir = mkdtempSync(join(tmpdir(), 'ragts-migrate-v2-test-'));
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

  it('migrates a session with markers', async () => {
    // Create .cast file with markers
    const castContent = createCastFileWithMarkers();
    const filePath = join(tmpDir, 'session-with-markers.cast');
    writeFileSync(filePath, castContent);

    // Create session with detection_status = 'pending'
    const session = sessionRepo.create({
      filename: 'session-with-markers.cast',
      filepath: filePath,
      size_bytes: castContent.length,
      marker_count: 2,
      uploaded_at: new Date().toISOString(),
    });

    // Run migration
    const result = await migrateV2(db);

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);

    // Verify session was updated
    const updatedSession = sessionRepo.findById(session.id);
    expect(updatedSession?.detection_status).toBe('completed');
    expect(updatedSession?.event_count).toBe(150);

    // Verify marker sections were created with line ranges (CLI session)
    const sections = sectionRepo.findBySessionId(session.id);
    const markerSections = sections.filter((s) => s.type === 'marker');

    expect(markerSections.length).toBe(2);
    expect(markerSections[0].label).toBe('Start');
    expect(markerSections[0].start_event).toBe(50);
    expect(markerSections[0].snapshot).toBe(null);
    expect(markerSections[0].start_line).toBeTypeOf('number');
    expect(markerSections[0].end_line).toBeTypeOf('number');

    expect(markerSections[1].label).toBe('Middle');
    expect(markerSections[1].start_event).toBe(100);
    expect(markerSections[1].snapshot).toBe(null);
    expect(markerSections[1].start_line).toBeTypeOf('number');
    expect(markerSections[1].end_line).toBeTypeOf('number');

    // Verify session has full snapshot
    expect(updatedSession?.snapshot).toBeTruthy();
    const fullSnapshot = JSON.parse(updatedSession!.snapshot!);
    expect(fullSnapshot.lines).toBeDefined();
  });

  it('skips already-completed sessions with unified snapshot', async () => {
    // Create .cast file
    const castContent = createCastFile(200);
    const filePath = join(tmpDir, 'completed-session.cast');
    writeFileSync(filePath, castContent);

    // Create session and manually set detection_status to 'completed'
    const session = sessionRepo.create({
      filename: 'completed-session.cast',
      filepath: filePath,
      size_bytes: castContent.length,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    // Manually set status to completed and add a unified snapshot
    sessionRepo.updateDetectionStatus(session.id, 'completed', 200, 0);
    sessionRepo.updateSnapshot(session.id, JSON.stringify({
      cols: 80,
      rows: 24,
      lines: [{ spans: [{ text: 'test', fg: null, bg: null, attrs: 0 }] }],
    }));

    // Create a marker section manually to verify no duplicates are created
    sectionRepo.create({
      sessionId: session.id,
      type: 'marker',
      startEvent: 0,
      endEvent: 200,
      label: 'Existing Section',
      snapshot: null,
      startLine: 0,
      endLine: 1,
    });

    // Run migration
    const result = await migrateV2(db);

    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);

    // Verify no new sections were created
    const sections = sectionRepo.findBySessionId(session.id);
    expect(sections.length).toBe(1);
    expect(sections[0].label).toBe('Existing Section');
  });

  it('handles corrupt .cast file gracefully', async () => {
    // Create session pointing to non-existent file
    const session1 = sessionRepo.create({
      filename: 'nonexistent.cast',
      filepath: '/nonexistent/file.cast',
      size_bytes: 1000,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    // Create valid session
    const castContent = createCastFile(200);
    const filePath = join(tmpDir, 'valid-session.cast');
    writeFileSync(filePath, castContent);

    const session2 = sessionRepo.create({
      filename: 'valid-session.cast',
      filepath: filePath,
      size_bytes: castContent.length,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    // Run migration
    const result = await migrateV2(db);

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(1);

    // Verify corrupt session status is 'failed'
    const failedSession = sessionRepo.findById(session1.id);
    expect(failedSession?.detection_status).toBe('failed');

    // Verify valid session was processed
    const validSession = sessionRepo.findById(session2.id);
    expect(validSession?.detection_status).toBe('completed');
    expect(validSession?.event_count).toBe(200);
  });

  it('is idempotent - running twice does not create duplicates', async () => {
    // Create .cast file
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

    // Run migration first time
    const result1 = await migrateV2(db);
    expect(result1.processed).toBe(1);

    const sectionsAfterFirst = sectionRepo.findBySessionId(session.id);
    const firstCount = sectionsAfterFirst.length;

    // Run migration second time
    const result2 = await migrateV2(db);
    expect(result2.processed).toBe(0);
    expect(result2.skipped).toBe(1);

    // Verify no duplicate sections were created
    const sectionsAfterSecond = sectionRepo.findBySessionId(session.id);
    expect(sectionsAfterSecond.length).toBe(firstCount);
  });

  it('updates session metadata after migration', async () => {
    // Create .cast file with screen clear to trigger detected sections
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

    // Run migration
    await migrateV2(db);

    // Verify session metadata was updated
    const updatedSession = sessionRepo.findById(session.id);
    expect(updatedSession?.detection_status).toBe('completed');
    expect(updatedSession?.event_count).toBe(200);
    expect(updatedSession?.detected_sections_count).toBeGreaterThan(0);
  });

  it('processes multiple sessions in sequence', async () => {
    // Create multiple sessions
    const sessions = [];
    for (let i = 0; i < 3; i++) {
      const castContent = createCastFile(200);
      const filePath = join(tmpDir, `session-${i}.cast`);
      writeFileSync(filePath, castContent);

      const session = sessionRepo.create({
        filename: `session-${i}.cast`,
        filepath: filePath,
        size_bytes: castContent.length,
        marker_count: 0,
        uploaded_at: new Date().toISOString(),
      });
      sessions.push(session);
    }

    // Run migration
    const result = await migrateV2(db);

    expect(result.processed).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);

    // Verify all sessions were processed
    for (const session of sessions) {
      const updated = sessionRepo.findById(session.id);
      expect(updated?.detection_status).toBe('completed');
      expect(updated?.event_count).toBe(200);
    }
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
