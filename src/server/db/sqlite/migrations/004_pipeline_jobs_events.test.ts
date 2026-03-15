/**
 * Tests for Migration 004: pipeline jobs and events tables.
 *
 * Verifies idempotency, schema correctness, index creation,
 * pre-existing session preservation, and interrupted-status assignment.
 */

// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from '../node_sqlite_compat.js';
import { migrate002Sections } from './002_sections.js';
import { migrate003UnifiedSnapshot } from './003_unified_snapshot.js';
import { migrate004PipelineJobsEvents } from './004_pipeline_jobs_events.js';

/** Sets up a fresh in-memory DB with base schema + migrations 002 and 003 applied. */
function createBaseDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL UNIQUE,
      size_bytes INTEGER NOT NULL,
      marker_count INTEGER DEFAULT 0,
      uploaded_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_uploaded_at ON sessions(uploaded_at DESC);
  `);

  migrate002Sections(db);
  migrate003UnifiedSnapshot(db);

  return db;
}

/** Returns column names for the given table. */
function getColumns(db: Database.Database, table: string): string[] {
  const cols = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  return cols.map((c) => c.name);
}

/** Returns index names for the given table. */
function getIndexes(db: Database.Database, table: string): string[] {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=? AND name NOT LIKE 'sqlite_%'"
    )
    .all(table) as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

/** Returns true if a table exists. */
function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(table);
  return row !== undefined;
}

describe('migrate004PipelineJobsEvents', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createBaseDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('jobs table', () => {
    it('creates the jobs table', () => {
      migrate004PipelineJobsEvents(db);
      expect(tableExists(db, 'jobs')).toBe(true);
    });

    it('jobs table has all required columns', () => {
      migrate004PipelineJobsEvents(db);
      const cols = getColumns(db, 'jobs');
      expect(cols).toContain('id');
      expect(cols).toContain('session_id');
      expect(cols).toContain('current_stage');
      expect(cols).toContain('status');
      expect(cols).toContain('attempts');
      expect(cols).toContain('max_attempts');
      expect(cols).toContain('last_error');
      expect(cols).toContain('started_at');
      expect(cols).toContain('completed_at');
      expect(cols).toContain('created_at');
      expect(cols).toContain('updated_at');
    });

    it('jobs table defaults: current_stage=validate, status=pending, attempts=0, max_attempts=3', () => {
      migrate004PipelineJobsEvents(db);

      db.exec(
        "INSERT INTO sessions (id, filename, filepath, size_bytes, uploaded_at) VALUES ('s1', 'test.cast', 'sessions/test.cast', 100, '2026-01-01T00:00:00Z')"
      );

      db.exec(
        "INSERT INTO jobs (id, session_id) VALUES ('j1', 's1')"
      );

      const job = db.prepare('SELECT * FROM jobs WHERE id=?').get('j1') as Record<string, unknown>;
      expect(job['current_stage']).toBe('validate');
      expect(job['status']).toBe('pending');
      expect(job['attempts']).toBe(0);
      expect(job['max_attempts']).toBe(3);
    });
  });

  describe('events table', () => {
    it('creates the events table', () => {
      migrate004PipelineJobsEvents(db);
      expect(tableExists(db, 'events')).toBe(true);
    });

    it('events table has all required columns', () => {
      migrate004PipelineJobsEvents(db);
      const cols = getColumns(db, 'events');
      expect(cols).toContain('id');
      expect(cols).toContain('session_id');
      expect(cols).toContain('event_type');
      expect(cols).toContain('stage');
      expect(cols).toContain('payload');
      expect(cols).toContain('created_at');
    });

    it('events id column is AUTOINCREMENT (integer primary key)', () => {
      migrate004PipelineJobsEvents(db);

      db.exec(
        "INSERT INTO sessions (id, filename, filepath, size_bytes, uploaded_at) VALUES ('s2', 'b.cast', 'sessions/b.cast', 100, '2026-01-01T00:00:00Z')"
      );

      db.exec("INSERT INTO events (session_id, event_type) VALUES ('s2', 'session.uploaded')");
      db.exec("INSERT INTO events (session_id, event_type) VALUES ('s2', 'session.validated')");

      const rows = db.prepare('SELECT id FROM events ORDER BY id').all() as Array<{ id: number }>;
      expect(rows[0]!.id).toBe(1);
      expect(rows[1]!.id).toBe(2);
    });
  });

  describe('indexes', () => {
    it('does not create a redundant idx_jobs_session_id (UNIQUE constraint covers it)', () => {
      migrate004PipelineJobsEvents(db);
      expect(getIndexes(db, 'jobs')).not.toContain('idx_jobs_session_id');
    });

    it('creates idx_jobs_status on jobs', () => {
      migrate004PipelineJobsEvents(db);
      expect(getIndexes(db, 'jobs')).toContain('idx_jobs_status');
    });

    it('creates idx_events_session_id on events', () => {
      migrate004PipelineJobsEvents(db);
      expect(getIndexes(db, 'events')).toContain('idx_events_session_id');
    });
  });

  describe('CHECK constraints', () => {
    beforeEach(() => {
      migrate004PipelineJobsEvents(db);
      db.exec(
        "INSERT INTO sessions (id, filename, filepath, size_bytes, uploaded_at) VALUES ('sc1', 'chk.cast', 'sessions/chk.cast', 100, '2026-01-01T00:00:00Z')"
      );
    });

    it('rejects invalid current_stage value', () => {
      expect(() =>
        db.exec("INSERT INTO jobs (id, session_id, current_stage) VALUES ('jc1', 'sc1', 'invalid_stage')")
      ).toThrow();
    });

    it('rejects invalid status value', () => {
      expect(() =>
        db.exec("INSERT INTO jobs (id, session_id, status) VALUES ('jc2', 'sc1', 'bogus_status')")
      ).toThrow();
    });

    it('accepts all valid current_stage values', () => {
      const stages = ['validate', 'detect', 'replay', 'dedup', 'store'];
      stages.forEach((stage, i) => {
        db.exec(
          `INSERT INTO sessions (id, filename, filepath, size_bytes, uploaded_at) VALUES ('ss${i}', 'f${i}.cast', 'sessions/f${i}.cast', 100, '2026-01-01T00:00:00Z')`
        );
        expect(() =>
          db.exec(`INSERT INTO jobs (id, session_id, current_stage) VALUES ('jv${i}', 'ss${i}', '${stage}')`)
        ).not.toThrow();
      });
    });

    it('accepts all valid status values', () => {
      const statuses = ['pending', 'running', 'completed', 'failed'];
      statuses.forEach((status, i) => {
        db.exec(
          `INSERT INTO sessions (id, filename, filepath, size_bytes, uploaded_at) VALUES ('sq${i}', 'g${i}.cast', 'sessions/g${i}.cast', 100, '2026-01-01T00:00:00Z')`
        );
        expect(() =>
          db.exec(`INSERT INTO jobs (id, session_id, status) VALUES ('js${i}', 'sq${i}', '${status}')`)
        ).not.toThrow();
      });
    });
  });

  describe('UNIQUE constraint on jobs.session_id', () => {
    it('rejects two jobs with the same session_id', () => {
      migrate004PipelineJobsEvents(db);
      db.exec(
        "INSERT INTO sessions (id, filename, filepath, size_bytes, uploaded_at) VALUES ('su1', 'u.cast', 'sessions/u.cast', 100, '2026-01-01T00:00:00Z')"
      );
      db.exec("INSERT INTO jobs (id, session_id) VALUES ('ju1', 'su1')");
      expect(() =>
        db.exec("INSERT INTO jobs (id, session_id) VALUES ('ju2', 'su1')")
      ).toThrow();
    });
  });

  describe('updated_at trigger', () => {
    it('updates updated_at when a job row is updated', () => {
      migrate004PipelineJobsEvents(db);
      db.exec(
        "INSERT INTO sessions (id, filename, filepath, size_bytes, uploaded_at) VALUES ('st1', 't.cast', 'sessions/t.cast', 100, '2026-01-01T00:00:00Z')"
      );
      db.exec(
        "INSERT INTO jobs (id, session_id, created_at, updated_at) VALUES ('jt1', 'st1', '2026-01-01T00:00:00', '2026-01-01T00:00:00')"
      );

      db.exec("UPDATE jobs SET status = 'running' WHERE id = 'jt1'");

      const job = db.prepare("SELECT updated_at FROM jobs WHERE id='jt1'").get() as Record<string, unknown>;
      expect(job['updated_at']).not.toBe('2026-01-01T00:00:00');
    });
  });

  describe('idempotency', () => {
    it('running migration twice does not throw', () => {
      expect(() => {
        migrate004PipelineJobsEvents(db);
        migrate004PipelineJobsEvents(db);
      }).not.toThrow();
    });

    it('running migration twice does not duplicate tables', () => {
      migrate004PipelineJobsEvents(db);
      migrate004PipelineJobsEvents(db);
      expect(tableExists(db, 'jobs')).toBe(true);
      expect(tableExists(db, 'events')).toBe(true);
    });

    it('running migration twice does not duplicate indexes', () => {
      migrate004PipelineJobsEvents(db);
      migrate004PipelineJobsEvents(db);
      const jobIndexes = getIndexes(db, 'jobs');
      const jobStatusCount = jobIndexes.filter((n) => n === 'idx_jobs_status').length;
      expect(jobStatusCount).toBe(1);
    });
  });

  describe('pre-existing session preservation', () => {
    it('sessions existing before migration are untouched', () => {
      db.exec(
        "INSERT INTO sessions (id, filename, filepath, size_bytes, uploaded_at, detection_status) VALUES ('pre1', 'old.cast', 'sessions/old.cast', 512, '2026-01-01T00:00:00Z', 'completed')"
      );

      migrate004PipelineJobsEvents(db);

      const session = db.prepare('SELECT * FROM sessions WHERE id=?').get('pre1') as Record<string, unknown>;
      expect(session['filename']).toBe('old.cast');
      expect(session['size_bytes']).toBe(512);
      expect(session['detection_status']).toBe('completed');
    });

    it('sessions with detection_status=completed are untouched after migration', () => {
      db.exec(
        "INSERT INTO sessions (id, filename, filepath, size_bytes, uploaded_at, detection_status) VALUES ('s-done', 'done.cast', 'sessions/done.cast', 100, '2026-01-01T00:00:00Z', 'completed')"
      );

      migrate004PipelineJobsEvents(db);

      const session = db.prepare("SELECT detection_status FROM sessions WHERE id='s-done'").get() as Record<string, unknown>;
      expect(session['detection_status']).toBe('completed');
    });

    it('sessions with detection_status=failed are untouched after migration', () => {
      db.exec(
        "INSERT INTO sessions (id, filename, filepath, size_bytes, uploaded_at, detection_status) VALUES ('s-failed', 'fail.cast', 'sessions/fail.cast', 100, '2026-01-01T00:00:00Z', 'failed')"
      );

      migrate004PipelineJobsEvents(db);

      const session = db.prepare("SELECT detection_status FROM sessions WHERE id='s-failed'").get() as Record<string, unknown>;
      expect(session['detection_status']).toBe('failed');
    });
  });

  describe('interrupted status assignment', () => {
    it('sessions in processing state are marked interrupted', () => {
      db.exec(
        "INSERT INTO sessions (id, filename, filepath, size_bytes, uploaded_at, detection_status) VALUES ('s-proc', 'proc.cast', 'sessions/proc.cast', 100, '2026-01-01T00:00:00Z', 'processing')"
      );

      migrate004PipelineJobsEvents(db);

      const session = db.prepare("SELECT detection_status FROM sessions WHERE id='s-proc'").get() as Record<string, unknown>;
      expect(session['detection_status']).toBe('interrupted');
    });

    it('sessions in pending state are not changed to interrupted', () => {
      db.exec(
        "INSERT INTO sessions (id, filename, filepath, size_bytes, uploaded_at, detection_status) VALUES ('s-pend', 'pend.cast', 'sessions/pend.cast', 100, '2026-01-01T00:00:00Z', 'pending')"
      );

      migrate004PipelineJobsEvents(db);

      const session = db.prepare("SELECT detection_status FROM sessions WHERE id='s-pend'").get() as Record<string, unknown>;
      expect(session['detection_status']).toBe('pending');
    });
  });

  describe('foreign key cascade', () => {
    it('deleting a session cascades to its jobs', () => {
      migrate004PipelineJobsEvents(db);

      db.exec(
        "INSERT INTO sessions (id, filename, filepath, size_bytes, uploaded_at) VALUES ('s3', 'c.cast', 'sessions/c.cast', 100, '2026-01-01T00:00:00Z')"
      );
      db.exec("INSERT INTO jobs (id, session_id) VALUES ('j2', 's3')");
      db.exec("DELETE FROM sessions WHERE id='s3'");

      const jobs = db.prepare("SELECT * FROM jobs WHERE session_id='s3'").all();
      expect(jobs).toHaveLength(0);
    });

    it('deleting a session cascades to its events', () => {
      migrate004PipelineJobsEvents(db);

      db.exec(
        "INSERT INTO sessions (id, filename, filepath, size_bytes, uploaded_at) VALUES ('s4', 'd.cast', 'sessions/d.cast', 100, '2026-01-01T00:00:00Z')"
      );
      db.exec("INSERT INTO events (session_id, event_type) VALUES ('s4', 'session.uploaded')");
      db.exec("DELETE FROM sessions WHERE id='s4'");

      const events = db.prepare("SELECT * FROM events WHERE session_id='s4'").all();
      expect(events).toHaveLength(0);
    });
  });
});
