/**
 * Adapter interface for pipeline event log persistence.
 *
 * The event log stores every PipelineEvent emitted during session processing.
 * Provides an audit trail and enables debugging via event history queries.
 *
 * Connections: persists to the `events` table created by migration 004.
 */

import type { PipelineEvent } from '../../shared/pipeline_events.js';

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
   * Find all logged events for a session, ordered by id ASC (insertion order).
   * Returns an empty array if no events exist for the session.
   */
  findBySessionId(sessionId: string): Promise<EventLogEntry[]>;
}
