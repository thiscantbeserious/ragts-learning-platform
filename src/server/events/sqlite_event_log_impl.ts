/**
 * SQLite implementation of EventLogAdapter.
 *
 * Persists pipeline events to the `events` table using prepared statements.
 * Extracts the stage field from events that carry one (session.failed, session.retrying).
 *
 * Connections: uses the same DB instance as other SQLite repositories.
 * Events table schema created by migration 004.
 */

import type Database from 'better-sqlite3';
import type { EventLogAdapter, EventLogEntry } from './event_log_adapter.js';
import type { PipelineEvent } from '../../shared/pipeline_events.js';

/** Extract the stage field from events that have one; returns null otherwise. */
function extractStage(event: PipelineEvent): string | null {
  if (event.type === 'session.failed' || event.type === 'session.retrying') {
    return event.stage;
  }
  return null;
}

/** SQLite-backed event log. Uses prepared statements for performance. */
export class SqliteEventLogImpl implements EventLogAdapter {
  private readonly insertStmt: Database.Statement;
  private readonly findBySessionIdStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO events (session_id, event_type, stage, payload)
      VALUES (?, ?, ?, ?)
    `);

    this.findBySessionIdStmt = db.prepare(`
      SELECT id, session_id, event_type, stage, payload, created_at
      FROM events
      WHERE session_id = ?
      ORDER BY id ASC
    `);
  }

  /**
   * Persist a pipeline event to the events table.
   * Stores the full event as JSON payload alongside extracted metadata.
   */
  async log(event: PipelineEvent): Promise<void> {
    const sessionId = event.sessionId;
    const stage = extractStage(event);
    const payload = JSON.stringify(event);
    this.insertStmt.run(sessionId, event.type, stage, payload);
  }

  /** Find all logged events for a session ordered by insertion. */
  async findBySessionId(sessionId: string): Promise<EventLogEntry[]> {
    const rows = this.findBySessionIdStmt.all(sessionId) as Array<Record<string, unknown>>;
    return rows.map(rowToEntry);
  }
}

/** Map a raw DB row to EventLogEntry. */
function rowToEntry(row: Record<string, unknown>): EventLogEntry {
  return {
    id: row['id'] as number,
    sessionId: row['session_id'] as string,
    eventType: row['event_type'] as string,
    stage: (row['stage'] as string | null) ?? null,
    payload: (row['payload'] as string | null) ?? null,
    createdAt: row['created_at'] as string,
  };
}
