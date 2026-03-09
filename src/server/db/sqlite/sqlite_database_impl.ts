/**
 * SQLite implementation of DatabaseAdapter.
 * Encapsulates DB initialization, migrations, and repository construction.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { BASE_SCHEMA } from './migrations/base_schema.js';
import { migrate002Sections } from './migrations/002_sections.js';
import { migrate003UnifiedSnapshot } from './migrations/003_unified_snapshot.js';
import { SqliteSessionImpl } from './sqlite_session_impl.js';
import { SqliteSectionImpl } from './sqlite_section_impl.js';
import { FsStorageImpl } from '../../storage/fs_storage_impl.js';
import type { DatabaseAdapter, DatabaseContext } from '../database_adapter.js';


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

      // Enable foreign key constraints
      db.pragma('foreign_keys = ON');

      // Apply base schema (inlined to avoid __dirname dependency in compiled output)
      db.exec(BASE_SCHEMA);

      // Run migrations
      migrate002Sections(db);
      migrate003UnifiedSnapshot(db);
    } catch (err) {
      db.close();
      throw err;
    }

    const sessionRepository = new SqliteSessionImpl(db);
    const sectionRepository = new SqliteSectionImpl(db);
    const storageAdapter = new FsStorageImpl(config.dataDir);

    return {
      sessionRepository,
      sectionRepository,
      storageAdapter,
      ping: async () => { db.prepare('SELECT 1').get(); },
      close: async () => { db.close(); },
    };
  }
}
