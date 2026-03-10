/**
 * Adapter interface for pipeline event log persistence.
 *
 * The event log stores every PipelineEvent emitted during session processing.
 * Provides an audit trail and enables debugging via event history queries.
 *
 * Connections: persists to the `events` table created by migration 004.
 */

import type { PipelineEvent } from '../../shared/types/pipeline.js';

/** A persisted pipeline event entry from the events table. */
export interface EventLogEntry {
  id: number;
  sessionId: string;
  eventType: string;
  stage: string | null;
  payload: string | null;
  createdAt: string;
}

/**
 * Adapter for pipeline event log persistence.
 * Implementations write to the events table and support queries by session.
 */
export interface EventLogAdapter {
  /**
   * Persist a pipeline event to the event log.
   * Stores event type, optional stage, and full JSON payload.
   */
  log(event: PipelineEvent): Promise<void>;

  /**
   * Synchronously persist a pipeline event and return the inserted row ID.
   * Used when the caller must attach the log ID to the event before
   * other synchronous event bus handlers fire.
   */
  logSync(event: PipelineEvent): number;

  /**
   * Find all logged events for a session, ordered by id ASC (insertion order).
   * Returns an empty array if no events exist for the session.
   */
  findBySessionId(sessionId: string): Promise<EventLogEntry[]>;

  /**
   * Find events for a session with id strictly greater than afterId, ordered by id ASC.
   * Used for efficient SSE replay — avoids loading all events then filtering in-memory.
   */
  findBySessionIdAfterId(sessionId: string, afterId: number): Promise<EventLogEntry[]>;

  /**
   * Delete events older than the given cutoff date.
   * Returns the number of deleted rows. Used for event log retention cleanup.
   */
  deleteOlderThan(cutoff: Date): Promise<number>;
}
