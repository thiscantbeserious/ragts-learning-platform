/**
 * Provider interface for the full database layer.
 * This is the single swap point for the entire persistence engine.
 * Implement this interface to add a PostgreSQL or other backend.
 */

import type { SessionRepository } from './session-repository.js';
import type { SectionRepository } from './section-repository.js';
import type { StorageAdapter } from '../storage/storage-adapter.js';

/**
 * All live persistence objects returned by a DatabaseProvider.
 * Consumers depend on this type, not on any concrete implementations.
 */
export interface DatabaseContext {
  sessionRepository: SessionRepository;
  sectionRepository: SectionRepository;
  storageAdapter: StorageAdapter;
  /** Release all underlying resources (DB connection, file handles, etc.). */
  close(): void | Promise<void>;
}

/**
 * Factory interface for initializing the full persistence layer.
 * Constructor receives no config — config is passed to initialize() so the
 * provider stays stateless until initialization.
 */
export interface DatabaseProvider {
  /**
   * Initialize the persistence layer.
   * Creates the database, runs migrations, constructs repositories and storage.
   * Returns a DatabaseContext with all live objects.
   */
  initialize(config: { dataDir: string }): Promise<DatabaseContext>;
}
