// @vitest-environment node
/**
 * Tests for SqliteSessionImpl.completeProcessing.
 * Verifies atomicity, replacement semantics, and correct DB state after the call.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { SqliteDatabaseImpl } from './sqlite_database_impl.js';
import type { DatabaseContext } from '../database_adapter.js';
import type { SessionAdapter } from '../session_adapter.js';
import type { ProcessedSession } from '../../processing/types.js';

describe('SqliteSessionImpl.completeProcessing', () => {
  let tmpDir: string;
  let ctx: DatabaseContext;
  let sessionRepo: SessionAdapter;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ragts-complete-processing-test-'));
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: tmpDir });
    sessionRepo = ctx.sessionRepository;
  });

  afterEach(async () => {
    await ctx.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores sections, snapshot, and completed status atomically', async () => {
    const session = await sessionRepo.create({
      filename: 'test.cast',
      filepath: '/tmp/test.cast',
      size_bytes: 100,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    const processed: ProcessedSession = {
      sessionId: session.id,
      snapshot: JSON.stringify({ lines: [{ spans: [{ text: 'hello' }] }] }),
      sections: [
        {
          sessionId: session.id,
          type: 'detected',
          startEvent: 0,
          endEvent: 10,
          label: 'Section 1',
          snapshot: null,
          startLine: 0,
          endLine: 5,
        },
        {
          sessionId: session.id,
          type: 'marker',
          startEvent: 10,
          endEvent: 20,
          label: 'Marker 1',
          snapshot: null,
          startLine: 5,
          endLine: 10,
        },
      ],
      eventCount: 20,
      detectedSectionsCount: 1,
    };

    await sessionRepo.completeProcessing(processed);

    const updated = await sessionRepo.findById(session.id);
    expect(updated?.detection_status).toBe('completed');
    expect(updated?.snapshot).toBe(processed.snapshot);
    expect(updated?.event_count).toBe(20);
    expect(updated?.detected_sections_count).toBe(1);

    const sections = await ctx.sectionRepository.findBySessionId(session.id);
    expect(sections.length).toBe(2);
    expect(sections[0]!.type).toBe('detected');
    expect(sections[1]!.type).toBe('marker');
  });

  it('replaces existing sections on second call (second set wins)', async () => {
    const session = await sessionRepo.create({
      filename: 'test.cast',
      filepath: '/tmp/test2.cast',
      size_bytes: 100,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    const firstProcessed: ProcessedSession = {
      sessionId: session.id,
      snapshot: JSON.stringify({ lines: [] }),
      sections: [
        {
          sessionId: session.id,
          type: 'detected',
          startEvent: 0,
          endEvent: 5,
          label: 'First Section A',
          snapshot: null,
          startLine: 0,
          endLine: 3,
        },
        {
          sessionId: session.id,
          type: 'detected',
          startEvent: 5,
          endEvent: 10,
          label: 'First Section B',
          snapshot: null,
          startLine: 3,
          endLine: 6,
        },
      ],
      eventCount: 10,
      detectedSectionsCount: 2,
    };

    await sessionRepo.completeProcessing(firstProcessed);

    const firstSections = await ctx.sectionRepository.findBySessionId(session.id);
    expect(firstSections.length).toBe(2);

    const secondProcessed: ProcessedSession = {
      sessionId: session.id,
      snapshot: JSON.stringify({ lines: [{ spans: [{ text: 'new' }] }] }),
      sections: [
        {
          sessionId: session.id,
          type: 'marker',
          startEvent: 0,
          endEvent: 15,
          label: 'Second Only Section',
          snapshot: null,
          startLine: 0,
          endLine: 8,
        },
      ],
      eventCount: 15,
      detectedSectionsCount: 0,
    };

    await sessionRepo.completeProcessing(secondProcessed);

    const secondSections = await ctx.sectionRepository.findBySessionId(session.id);
    expect(secondSections.length).toBe(1);
    expect(secondSections[0]!.label).toBe('Second Only Section');

    const updated = await sessionRepo.findById(session.id);
    expect(updated?.event_count).toBe(15);
    expect(updated?.detected_sections_count).toBe(0);
  });

  it('handles zero sections (no sections to insert)', async () => {
    const session = await sessionRepo.create({
      filename: 'test.cast',
      filepath: '/tmp/test3.cast',
      size_bytes: 100,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    const processed: ProcessedSession = {
      sessionId: session.id,
      snapshot: JSON.stringify({ lines: [] }),
      sections: [],
      eventCount: 5,
      detectedSectionsCount: 0,
    };

    await sessionRepo.completeProcessing(processed);

    const updated = await sessionRepo.findById(session.id);
    expect(updated?.detection_status).toBe('completed');
    expect(updated?.event_count).toBe(5);

    const sections = await ctx.sectionRepository.findBySessionId(session.id);
    expect(sections.length).toBe(0);
  });

  it('generates unique IDs for each inserted section', async () => {
    const session = await sessionRepo.create({
      filename: 'test.cast',
      filepath: '/tmp/test4.cast',
      size_bytes: 100,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    const sections = Array.from({ length: 5 }, (_, i) => ({
      sessionId: session.id,
      type: 'detected' as const,
      startEvent: i * 10,
      endEvent: (i + 1) * 10,
      label: `Section ${i}`,
      snapshot: null,
      startLine: i * 3,
      endLine: (i + 1) * 3,
    }));

    await sessionRepo.completeProcessing({
      sessionId: session.id,
      snapshot: '{}',
      sections,
      eventCount: 50,
      detectedSectionsCount: 5,
    });

    const stored = await ctx.sectionRepository.findBySessionId(session.id);
    const ids = stored.map(s => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(5);
  });
});

describe('SqliteSessionImpl.completeProcessing — atomicity on constraint violation', () => {
  let tmpDir: string;
  let rawDb: Database.Database;
  let ctx: DatabaseContext;
  let sessionRepo: SessionAdapter;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ragts-atomicity-test-'));
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: tmpDir });
    sessionRepo = ctx.sessionRepository;
    // Open a second connection to inspect raw DB state
    rawDb = new Database(join(tmpDir, 'ragts.db'));
  });

  afterEach(async () => {
    rawDb.close();
    await ctx.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rolls back completely when a section insert fails mid-transaction', async () => {
    const session = await sessionRepo.create({
      filename: 'atomic.cast',
      filepath: '/tmp/atomic.cast',
      size_bytes: 100,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    // Pre-populate 2 sections
    const firstProcessed: ProcessedSession = {
      sessionId: session.id,
      snapshot: 'original-snapshot',
      sections: [
        {
          sessionId: session.id,
          type: 'detected',
          startEvent: 0,
          endEvent: 5,
          label: 'Original A',
          snapshot: null,
          startLine: 0,
          endLine: 2,
        },
        {
          sessionId: session.id,
          type: 'detected',
          startEvent: 5,
          endEvent: 10,
          label: 'Original B',
          snapshot: null,
          startLine: 2,
          endLine: 4,
        },
      ],
      eventCount: 10,
      detectedSectionsCount: 2,
    };

    await sessionRepo.completeProcessing(firstProcessed);

    // Now attempt with invalid data that will fail inside the transaction:
    // duplicate session_id + start_event + type combination won't violate any constraint here,
    // so we test with a section that has a type value violating the DB check constraint instead.
    // Since SQLite doesn't enforce CHECK by default in older versions, test with an
    // extremely long label that triggers an error by using a direct DB manipulation approach.
    // Actually, the cleanest approach: inject a null session_id which violates NOT NULL.
    const invalidProcessed: ProcessedSession = {
      sessionId: session.id,
      snapshot: 'should-not-be-stored',
      sections: [
        {
          sessionId: session.id,
          type: 'detected',
          startEvent: 0,
          endEvent: 5,
          label: 'Valid section',
          snapshot: null,
          startLine: 0,
          endLine: 2,
        },
        {
          // Force a DB error: null sessionId violates NOT NULL constraint on session_id
          sessionId: null as unknown as string,
          type: 'detected',
          startEvent: 5,
          endEvent: 10,
          label: 'Invalid section',
          snapshot: null,
          startLine: 2,
          endLine: 4,
        },
      ],
      eventCount: 99,
      detectedSectionsCount: 1,
    };

    await expect(sessionRepo.completeProcessing(invalidProcessed)).rejects.toThrow();

    // Original sections must still be present (transaction rolled back)
    const sections = rawDb.prepare('SELECT * FROM sections WHERE session_id = ?').all(session.id) as any[];
    expect(sections.length).toBe(2);
    expect(sections.map((s: any) => s.label).sort()).toEqual(['Original A', 'Original B']);

    // Snapshot must not have changed
    const row = rawDb.prepare('SELECT snapshot FROM sessions WHERE id = ?').get(session.id) as any;
    expect(row.snapshot).toBe('original-snapshot');
  });
});
