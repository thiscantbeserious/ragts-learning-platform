/**
 * SQLite implementation of SessionAdapter.
 * Uses prepared statements for performance and safety.
 */

import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type { Session, SessionCreate } from '../../../shared/types.js';
import type { SessionAdapter } from '../session_adapter.js';
import type { DetectionStatus } from '../../../shared/pipeline_events.js';
import type { ProcessedSession } from '../../processing/types.js';

/**
 * SQLite-backed session implementation.
 * All methods use prepared statements.
 */
export class SqliteSessionImpl implements SessionAdapter {
  private readonly insertStmt: Database.Statement;
  private readonly findAllStmt: Database.Statement;
  private readonly findByIdStmt: Database.Statement;
  private readonly deleteByIdStmt: Database.Statement;
  private readonly updateDetectionStatusStmt: Database.Statement;
  private readonly updateSnapshotStmt: Database.Statement;
  private readonly deleteSectionsStmt: Database.Statement;
  private readonly insertSectionStmt: Database.Statement;
  private readonly completeProcessingTxn: (session: ProcessedSession) => void;

  constructor(db: Database.Database) {
    // Prepare statements once at construction
    this.insertStmt = db.prepare(`
      INSERT INTO sessions (id, filename, filepath, size_bytes, marker_count, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Exclude snapshot column from list view (too large)
    this.findAllStmt = db.prepare(`
      SELECT id, filename, filepath, size_bytes, marker_count, uploaded_at,
             created_at, agent_type, event_count, detected_sections_count,
             detection_status
      FROM sessions
      ORDER BY uploaded_at DESC
    `);

    // Include snapshot column for detail view
    this.findByIdStmt = db.prepare(`
      SELECT * FROM sessions
      WHERE id = ?
    `);

    this.deleteByIdStmt = db.prepare(`
      DELETE FROM sessions
      WHERE id = ?
    `);

    this.updateDetectionStatusStmt = db.prepare(`
      UPDATE sessions
      SET detection_status = ?,
          event_count = COALESCE(?, event_count),
          detected_sections_count = COALESCE(?, detected_sections_count)
      WHERE id = ?
    `);

    this.updateSnapshotStmt = db.prepare(`
      UPDATE sessions
      SET snapshot = ?
      WHERE id = ?
    `);

    // Section statements for completeProcessing — duplicated from SqliteSectionImpl
    // to keep adapter implementations decoupled. This is intentional (see ADR decision #7).
    this.deleteSectionsStmt = db.prepare(`
      DELETE FROM sections WHERE session_id = ?
    `);

    this.insertSectionStmt = db.prepare(`
      INSERT INTO sections (id, session_id, type, start_event, end_event, label, snapshot, start_line, end_line)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Synchronous transaction: atomically replaces sections and marks session completed.
    // Using db.transaction() ensures all writes succeed or none do, even if insert loop
    // partially completes. Called from the async completeProcessing method.
    this.completeProcessingTxn = db.transaction((session: ProcessedSession) => {
      this.deleteSectionsStmt.run(session.sessionId);
      for (const section of session.sections) {
        this.insertSectionStmt.run(
          nanoid(),
          section.sessionId,
          section.type,
          section.startEvent,
          section.endEvent,
          section.label,
          section.snapshot,
          section.startLine,
          section.endLine
        );
      }
      this.updateSnapshotStmt.run(session.snapshot, session.sessionId);
      this.updateDetectionStatusStmt.run(
        'completed',
        session.eventCount,
        session.detectedSectionsCount,
        session.sessionId
      );
    });
  }

  async create(data: SessionCreate): Promise<Session> {
    const id = nanoid();
    return this.createWithId(id, data);
  }

  async createWithId(id: string, data: SessionCreate): Promise<Session> {
    this.insertStmt.run(
      id,
      data.filename,
      data.filepath,
      data.size_bytes,
      data.marker_count,
      data.uploaded_at
    );

    // Retrieve the created session to get generated created_at
    const session = this.findByIdStmt.get(id) as Session;
    return session;
  }

  async findAll(): Promise<Session[]> {
    return this.findAllStmt.all() as Session[];
  }

  async findById(id: string): Promise<Session | null> {
    const session = this.findByIdStmt.get(id) as Session | undefined;
    return session || null;
  }

  async deleteById(id: string): Promise<boolean> {
    const result = this.deleteByIdStmt.run(id);
    return result.changes > 0;
  }

  /**
   * Update session detection status and metadata.
   * Used after processing a session for section detection.
   */
  async updateDetectionStatus(
    id: string,
    status: DetectionStatus,
    eventCount?: number,
    detectedSectionsCount?: number
  ): Promise<void> {
    this.updateDetectionStatusStmt.run(
      status,
      eventCount ?? null,
      detectedSectionsCount ?? null,
      id
    );
  }

  /**
   * Update the unified snapshot for a session.
   * Stores the full getAllLines() JSON from the VT terminal.
   */
  async updateSnapshot(id: string, snapshot: string): Promise<void> {
    this.updateSnapshotStmt.run(snapshot, id);
  }

  /**
   * Complete session processing atomically.
   * Replaces all sections, stores the snapshot, and marks the session as completed
   * in a single synchronous db.transaction() — no partial state possible.
   */
  async completeProcessing(session: ProcessedSession): Promise<void> {
    this.completeProcessingTxn(session);
  }
}
