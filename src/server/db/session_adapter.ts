/**
 * Adapter interface for session persistence.
 * This is the abstraction boundary — implementations can swap SQLite for PostgreSQL.
 */

import type { Session, SessionCreate } from '../../shared/types.js';
import type { ProcessedSession } from '../processing/types.js';
import type { DetectionStatus } from '../../shared/pipeline_events.js';

/**
 * Adapter for managing session entities.
 * Defines the contract for session data access.
 */
export interface SessionAdapter {
  /**
   * Create a new session.
   * Returns the created session with generated fields (id, created_at).
   */
  create(data: SessionCreate): Promise<Session>;

  /**
   * Create a new session with specified ID.
   * Used for transactional file + DB creation where ID must be known upfront.
   * Returns the created session with generated fields (created_at).
   */
  createWithId(id: string, data: SessionCreate): Promise<Session>;

  /**
   * Find all sessions, ordered by upload timestamp descending (newest first).
   */
  findAll(): Promise<Session[]>;

  /**
   * Find a session by ID.
   * Returns null if not found.
   */
  findById(id: string): Promise<Session | null>;

  /**
   * Delete a session by ID.
   * Returns true if deleted, false if not found.
   */
  deleteById(id: string): Promise<boolean>;

  /**
   * Update session detection status and metadata.
   * Used after processing a session for section detection.
   */
  updateDetectionStatus(
    id: string,
    status: DetectionStatus,
    eventCount?: number,
    detectedSectionsCount?: number
  ): Promise<void>;

  /**
   * Update the unified snapshot for a session.
   * Stores the full getAllLines() JSON from the VT terminal.
   */
  updateSnapshot(id: string, snapshot: string): Promise<void>;

  /**
   * Complete session processing. Atomically replaces all sections, stores the snapshot,
   * and marks the session as completed. The implementation owns the transaction boundary.
   * This is the counterpart to `updateDetectionStatus('processing')` — it transitions
   * the session to its final processed state.
   */
  completeProcessing(session: ProcessedSession): Promise<void>;
}
