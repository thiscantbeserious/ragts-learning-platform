/**
 * SQLite implementation of DatabaseAdapter.
 * Encapsulates DB initialization, migrations, and repository construction.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { migrate002Sections } from './migrations/002_sections.js';
import { migrate003UnifiedSnapshot } from './migrations/003_unified_snapshot.js';
import { migrate004PipelineJobsEvents } from './migrations/004_pipeline_jobs_events.js';
import { SqliteSessionImpl } from './sqlite_session_impl.js';
import { SqliteSectionImpl } from './sqlite_section_impl.js';
import { FsStorageImpl } from '../../storage/fs_storage_impl.js';
import { SqliteJobQueueImpl } from '../../jobs/sqlite_job_queue_impl.js';
import { SqliteEventLogImpl } from '../../events/sqlite_event_log_impl.js';
import type { DatabaseAdapter, DatabaseContext } from '../database_adapter.js';

// Schema source: src/server/db/sqlite/sql/schema.sql (kept for documentation)
export const BASE_SCHEMA = `
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
`.trim();

/**
 * SQLite-backed database implementation.
 * Initializes the DB and wires up all repositories.
 * The database file is placed at `<dataDir>/ragts.db` by default.
 */
export class SqliteDatabaseImpl implements DatabaseAdapter {
  /**
   * Initialize the SQLite persistence layer.
   * Creates the database at `<dataDir>/ragts.db`, runs migrations,
   * and constructs all repositories and the storage adapter.
   *
   * @param config.dataDir - Directory for the database file and session files.
   * @param config.dbPath - Optional override for the database file path.
   *   Use ':memory:' in tests to get a fast in-memory database.
   */
  async initialize(config: { dataDir: string; dbPath?: string }): Promise<DatabaseContext> {
    const dbPath = config.dbPath ?? join(config.dataDir, 'ragts.db');

    // Accepted exception: sync I/O at startup only -- runs before the HTTP server starts,
    // so it does not block request handling. See ADR: Harden the Foundation, Decision #4.
    mkdirSync(config.dataDir, { recursive: true });

    // Create parent directory for custom dbPath if needed (skip for :memory:)
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }

    // Open database connection
    const db = new Database(dbPath);

    try {
      // Enable WAL mode for better concurrent read performance
      db.pragma('journal_mode = WAL');

      // Auto-reclaim space after deletes (avoids database bloat over time)
      db.pragma('auto_vacuum = FULL');

      // Enable foreign key constraints
      db.pragma('foreign_keys = ON');

      // Apply base schema (inlined to avoid __dirname dependency in compiled output)
      db.exec(BASE_SCHEMA);

      // Run migrations
      migrate002Sections(db);
      migrate003UnifiedSnapshot(db);
      migrate004PipelineJobsEvents(db);
    } catch (err) {
      db.close();
      throw err;
    }

    const sessionRepository = new SqliteSessionImpl(db);
    const sectionRepository = new SqliteSectionImpl(db);
    const storageAdapter = new FsStorageImpl(config.dataDir);
    const jobQueue = new SqliteJobQueueImpl(db);
    const eventLog = new SqliteEventLogImpl(db);

    return {
      sessionRepository,
      sectionRepository,
      storageAdapter,
      jobQueue,
      eventLog,
      ping: async () => { db.prepare('SELECT 1').get(); },
      close: async () => { db.close(); },
    };
  }
}
