/**
 * SQLite implementation of DatabaseAdapter.
 * Encapsulates DB initialization, migrations, and repository construction.
 */

import { join } from 'path';
import { initDatabase } from './database.js';
import { SqliteSessionImpl } from './sqlite-session-impl.js';
import { SqliteSectionImpl } from './sqlite-section-impl.js';
import { FsStorageImpl } from '../storage/fs-storage-impl.js';
import type { DatabaseAdapter, DatabaseContext } from './database-adapter.js';

/**
 * SQLite-backed database implementation.
 * Delegates DB initialization to initDatabase(), then wires up all repositories.
 * The database file is placed at `<dataDir>/ragts.db`.
 */
export class SqliteDatabaseImpl implements DatabaseAdapter {
  /**
   * Initialize the SQLite persistence layer.
   * Creates the database at `<dataDir>/ragts.db`, runs migrations,
   * and constructs all repositories and the storage adapter.
   */
  async initialize(config: { dataDir: string }): Promise<DatabaseContext> {
    const dbPath = join(config.dataDir, 'ragts.db');
    const db = initDatabase(dbPath);

    const sessionRepository = new SqliteSessionImpl(db);
    const sectionRepository = new SqliteSectionImpl(db);
    const storageAdapter = new FsStorageImpl(config.dataDir);

    return {
      sessionRepository,
      sectionRepository,
      storageAdapter,
      close: () => { db.close(); },
    };
  }
}
