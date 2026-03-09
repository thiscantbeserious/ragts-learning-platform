/**
 * Adapter interface for the full database layer.
 * This is the single swap point for the entire persistence engine.
 * Implement this interface to add a PostgreSQL or other backend.
 */

import type { SessionAdapter } from './session_adapter.js';
import type { SectionAdapter } from './section_adapter.js';
import type { StorageAdapter } from '../storage/storage_adapter.js';

/**
 * All live persistence objects returned by a DatabaseAdapter.
 * Consumers depend on this type, not on any concrete implementations.
 */
export interface DatabaseContext {
  sessionRepository: SessionAdapter;
  sectionRepository: SectionAdapter;
  storageAdapter: StorageAdapter;
  /** Execute a trivial query to verify database connectivity. */
  ping(): Promise<void>;
  /** Release all underlying resources (DB connection, file handles, etc.). */
  close(): Promise<void>;
}

/**
 * Factory interface for initializing the full persistence layer.
 * Constructor receives no config — config is passed to initialize() so the
 * adapter stays stateless until initialization.
 */
export interface DatabaseAdapter {
  /**
   * Initialize the persistence layer.
   * Creates the database, runs migrations, constructs repositories and storage.
   * Returns a DatabaseContext with all live objects.
   */
  initialize(config: { dataDir: string; dbPath?: string }): Promise<DatabaseContext>;
}
