/**
 * SQLite implementation of SessionRepository.
 * Uses prepared statements for performance and safety.
 */

import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type { Session, SessionCreate } from '../../shared/types.js';
import type { SessionRepository } from './session-repository.js';

/**
 * SQLite-backed session repository.
 * All methods use prepared statements.
 */
export class SqliteSessionRepository implements SessionRepository {
  private insertStmt: Database.Statement;
  private findAllStmt: Database.Statement;
  private findByIdStmt: Database.Statement;
  private deleteByIdStmt: Database.Statement;
  private updateDetectionStatusStmt: Database.Statement;
  private updateSnapshotStmt: Database.Statement;

  constructor(private db: Database.Database) {
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
  }

  create(data: SessionCreate): Session {
    const id = nanoid();
    return this.createWithId(id, data);
  }

  createWithId(id: string, data: SessionCreate): Session {
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

  findAll(): Session[] {
    return this.findAllStmt.all() as Session[];
  }

  findById(id: string): Session | null {
    const session = this.findByIdStmt.get(id) as Session | undefined;
    return session || null;
  }

  deleteById(id: string): boolean {
    const result = this.deleteByIdStmt.run(id);
    return result.changes > 0;
  }

  /**
   * Update session detection status and metadata.
   * Used after processing a session for section detection.
   */
  updateDetectionStatus(
    id: string,
    status: 'pending' | 'processing' | 'completed' | 'failed',
    eventCount?: number,
    detectedSectionsCount?: number
  ): void {
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
  updateSnapshot(id: string, snapshot: string): void {
    this.updateSnapshotStmt.run(snapshot, id);
  }
}
