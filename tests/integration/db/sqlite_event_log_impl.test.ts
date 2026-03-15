// @vitest-environment node
/**
 * Tests for SqliteEventLogImpl: insert, query by session, payload storage.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from '../../../src/server/db/sqlite/node_sqlite_compat.js';
import { SqliteDatabaseImpl, BASE_SCHEMA } from '../../../src/server/db/sqlite/sqlite_database_impl.js';
import { migrate002Sections } from '../../../src/server/db/sqlite/migrations/002_sections.js';
import { migrate003UnifiedSnapshot } from '../../../src/server/db/sqlite/migrations/003_unified_snapshot.js';
import { migrate004PipelineJobsEvents } from '../../../src/server/db/sqlite/migrations/004_pipeline_jobs_events.js';
import { SqliteEventLogImpl } from '../../../src/server/events/sqlite_event_log_impl.js';
import type { DatabaseContext } from '../../../src/server/db/database_adapter.js';
import type { EventLogAdapter } from '../../../src/server/events/event_log_adapter.js';
import { createTestSession } from '../../../src/server/db/sqlite/test_fixtures.js';

describe('SqliteEventLogImpl', () => {
  let ctx: DatabaseContext;
  let eventLog: EventLogAdapter;
  let sessionId: string;

  beforeEach(async () => {
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: '/tmp', dbPath: ':memory:' });
    eventLog = ctx.eventLog;

    const session = await ctx.sessionRepository.create(
      createTestSession({ filename: 'evlog.cast', filepath: 'sessions/evlog.cast' })
    );
    sessionId = session.id;
  });

  afterEach(async () => {
    await ctx.close();
  });

  describe('log', () => {
    it('persists a session.uploaded event', async () => {
      await eventLog.log({ type: 'session.uploaded', sessionId, filename: 'evlog.cast' });

      const entries = await eventLog.findBySessionId(sessionId);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.eventType).toBe('session.uploaded');
      expect(entries[0]!.sessionId).toBe(sessionId);
      expect(entries[0]!.stage).toBeNull();
    });

    it('stores full JSON payload', async () => {
      await eventLog.log({ type: 'session.validated', sessionId, eventCount: 42 });

      const entries = await eventLog.findBySessionId(sessionId);
      const parsed = JSON.parse(entries[0]!.payload!);
      expect(parsed.eventCount).toBe(42);
      expect(parsed.type).toBe('session.validated');
    });

    it('extracts stage for session.failed events', async () => {
      await eventLog.log({
        type: 'session.failed',
        sessionId,
        stage: 'validate' as never,
        error: 'file not found',
      });

      const entries = await eventLog.findBySessionId(sessionId);
      expect(entries[0]!.stage).toBe('validate');
    });

    it('extracts stage for session.retrying events', async () => {
      await eventLog.log({
        type: 'session.retrying',
        sessionId,
        stage: 'detect' as never,
        attempt: 2,
      });

      const entries = await eventLog.findBySessionId(sessionId);
      expect(entries[0]!.stage).toBe('detect');
    });

    it('sets stage to null for events without a stage field', async () => {
      await eventLog.log({ type: 'session.ready', sessionId });

      const entries = await eventLog.findBySessionId(sessionId);
      expect(entries[0]!.stage).toBeNull();
    });
  });

  describe('findBySessionId — null payload path', () => {
    it('returns null for payload when the DB row has a NULL payload column', async () => {
      // Set up a minimal in-memory DB with just the events table
      const rawDb = new Database(':memory:');
      rawDb.exec(BASE_SCHEMA);
      migrate002Sections(rawDb);
      migrate003UnifiedSnapshot(rawDb);
      migrate004PipelineJobsEvents(rawDb);

      // Insert a session for FK constraint
      rawDb.prepare(
        `INSERT INTO sessions (id, filename, filepath, size_bytes, uploaded_at) VALUES (?, ?, ?, ?, ?)`
      ).run('s-null-payload', 'null.cast', 'sessions/null.cast', 10, new Date().toISOString());

      // Insert an event row with NULL payload directly, bypassing the log() method
      rawDb.prepare(
        `INSERT INTO events (session_id, event_type, stage, payload) VALUES (?, ?, ?, ?)`
      ).run('s-null-payload', 'session.uploaded', null, null);

      const impl = new SqliteEventLogImpl(rawDb);
      const entries = await impl.findBySessionId('s-null-payload');

      expect(entries).toHaveLength(1);
      expect(entries[0]!.payload).toBeNull();

      rawDb.close();
    });
  });

  describe('findBySessionId', () => {
    it('returns empty array when no events exist', async () => {
      const entries = await eventLog.findBySessionId('nonexistent');
      expect(entries).toEqual([]);
    });

    it('returns events ordered by insertion (id ASC)', async () => {
      await eventLog.log({ type: 'session.uploaded', sessionId, filename: 'f.cast' });
      await eventLog.log({ type: 'session.validated', sessionId, eventCount: 10 });
      await eventLog.log({ type: 'session.ready', sessionId });

      const entries = await eventLog.findBySessionId(sessionId);
      expect(entries).toHaveLength(3);
      expect(entries[0]!.eventType).toBe('session.uploaded');
      expect(entries[1]!.eventType).toBe('session.validated');
      expect(entries[2]!.eventType).toBe('session.ready');
    });

    it('does not return events for other sessions', async () => {
      const other = await ctx.sessionRepository.create(
        createTestSession({ filename: 'other.cast', filepath: 'sessions/other.cast' })
      );

      await eventLog.log({ type: 'session.uploaded', sessionId, filename: 'evlog.cast' });
      await eventLog.log({ type: 'session.uploaded', sessionId: other.id, filename: 'other.cast' });

      const entries = await eventLog.findBySessionId(sessionId);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.sessionId).toBe(sessionId);
    });
  });
});
