/**
 * Repository interface for session persistence.
 * This is the abstraction boundary - implementations can swap SQLite for PostgreSQL.
 */

import type { Session, SessionCreate } from '../../shared/types.js';

/**
 * Repository for managing session entities.
 * Defines the contract for session data access.
 */
export interface SessionRepository {
  /**
   * Create a new session.
   * Returns the created session with generated fields (id, created_at).
   */
  create(data: SessionCreate): Session;

  /**
   * Create a new session with specified ID.
   * Used for transactional file + DB creation where ID must be known upfront.
   * Returns the created session with generated fields (created_at).
   */
  createWithId(id: string, data: SessionCreate): Session;

  /**
   * Find all sessions, ordered by upload timestamp descending (newest first).
   */
  findAll(): Session[];

  /**
   * Find a session by ID.
   * Returns null if not found.
   */
  findById(id: string): Session | null;

  /**
   * Delete a session by ID.
   * Returns true if deleted, false if not found.
   */
  deleteById(id: string): boolean;
}
