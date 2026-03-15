/**
 * SQLite implementation of EventLogAdapter.
 *
 * Persists pipeline events to the `events` table using prepared statements.
 * Extracts the stage field from events that carry one (session.failed, session.retrying).
 *
 * Connections: uses the same DB instance as other SQLite repositories.
 * Events table schema created by migration 004.
 */

import Database from '../db/sqlite/node_sqlite_compat.js';
import type { EventLogAdapter, EventLogEntry } from './event_log_adapter.js';
import type { PipelineEvent } from '../../shared/types/pipeline.js';

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
  private readonly findAfterIdStmt: Database.Statement;
  private readonly deleteOlderThanStmt: Database.Statement;

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

    this.findAfterIdStmt = db.prepare(`
      SELECT id, session_id, event_type, stage, payload, created_at
      FROM events
      WHERE session_id = ? AND id > ?
      ORDER BY id ASC
    `);

    this.deleteOlderThanStmt = db.prepare('DELETE FROM events WHERE created_at < ?');
  }

  /**
   * Persist a pipeline event to the events table.
   * Stores the full event as JSON payload alongside extracted metadata.
   */
  async log(event: PipelineEvent): Promise<void> {
    this.logSync(event);
  }

  /**
   * Synchronously persist a pipeline event and return the inserted row ID.
   * Allows callers to attach the log ID to the event before other
   * synchronous event bus handlers fire.
   */
  logSync(event: PipelineEvent): number {
    const sessionId = event.sessionId;
    const stage = extractStage(event);
    const payload = JSON.stringify(event);
    const result = this.insertStmt.run(sessionId, event.type, stage, payload);
    return Number(result.lastInsertRowid);
  }

  /** Find all logged events for a session ordered by insertion. */
  async findBySessionId(sessionId: string): Promise<EventLogEntry[]> {
    const rows = this.findBySessionIdStmt.all(sessionId) as Array<Record<string, unknown>>;
    return rows.map(rowToEntry);
  }

  /** Find events for a session with id strictly greater than afterId, ordered by id ASC. */
  async findBySessionIdAfterId(sessionId: string, afterId: number): Promise<EventLogEntry[]> {
    const rows = this.findAfterIdStmt.all(sessionId, afterId) as Array<Record<string, unknown>>;
    return rows.map(rowToEntry);
  }

  /** Delete events older than the given cutoff date. Returns the count of deleted rows. */
  async deleteOlderThan(cutoff: Date): Promise<number> {
    const result = this.deleteOlderThanStmt.run(cutoff.toISOString());
    return result.changes;
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
