/**
 * Migration 004: Add pipeline jobs and events tables.
 *
 * This migration:
 * 1. Creates the `jobs` table for crash-resilient processing state (job queue)
 * 2. Creates the `events` table as an event log for observability and SSE replay
 * 3. Creates indexes on jobs.status and events.session_id
 * 4. Creates a trigger to auto-update jobs.updated_at on row update
 * 5. Marks any sessions in `processing` state as `interrupted`
 *
 * Idempotent — safe to run multiple times.
 * Wrapped in a transaction for atomicity (SQLite DDL is transactional).
 */

import Database from '../node_sqlite_compat.js';

/** Asserts sessions table exists — prerequisite for this migration. */
function assertSessionsTableExists(db: Database.Database): void {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
    .get();
  if (!row) {
    throw new Error('Sessions table does not exist. Run base schema first.');
  }
}

/** Creates the jobs table if it does not already exist. */
function createJobsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
      current_stage TEXT NOT NULL DEFAULT 'validate'
        CHECK (current_stage IN ('validate', 'detect', 'replay', 'dedup', 'store')),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      last_error TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

/** Creates the events table if it does not already exist. */
function createEventsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      stage TEXT,
      payload TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

/**
 * Creates indexes on jobs and events tables (all IF NOT EXISTS — idempotent).
 * Note: idx_jobs_session_id is omitted — the UNIQUE constraint creates an implicit index.
 */
function createIndexes(db: Database.Database): void {
  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id)');
}

/**
 * Creates a trigger that auto-updates jobs.updated_at after any UPDATE on jobs.
 * Uses IF NOT EXISTS for idempotency.
 */
function createUpdatedAtTrigger(db: Database.Database): void {
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_jobs_updated_at
      AFTER UPDATE ON jobs
      FOR EACH ROW
      BEGIN
        UPDATE jobs SET updated_at = datetime('now') WHERE id = OLD.id;
      END
  `);
}

/**
 * Marks sessions stuck in `processing` state as `interrupted`.
 * These sessions were mid-flight when the server was last stopped.
 * Stage 3 (job queue) will make them retryable on next boot.
 */
function markInterruptedSessions(db: Database.Database): void {
  db.prepare(
    "UPDATE sessions SET detection_status = 'interrupted' WHERE detection_status = 'processing'"
  ).run();
}

/**
 * Applies migration 004: creates `jobs` and `events` tables with indexes,
 * an updated_at trigger on jobs, and marks in-flight sessions as interrupted.
 */
export function migrate004PipelineJobsEvents(db: Database.Database): void {
  assertSessionsTableExists(db);

  const runMigration = db.transaction(() => {
    createJobsTable(db);
    createEventsTable(db);
    createIndexes(db);
    createUpdatedAtTrigger(db);
    markInterruptedSessions(db);
  });

  runMigration();
}
