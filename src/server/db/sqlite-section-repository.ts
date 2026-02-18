/**
 * SQLite implementation of Section Repository.
 * Manages sections (marker-based and detected) within sessions.
 * Uses prepared statements for performance and safety.
 */

import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

/**
 * Section row from database.
 * Matches the sections table schema.
 */
export interface SectionRow {
  id: string;
  session_id: string;
  type: 'marker' | 'detected';
  start_event: number;
  end_event: number | null;
  label: string | null;
  snapshot: string | null;
  start_line: number | null;
  end_line: number | null;
  created_at: string;
}

/**
 * Input data for creating a new section.
 * Omits generated fields (id, created_at).
 */
export interface CreateSectionInput {
  sessionId: string;
  type: 'marker' | 'detected';
  startEvent: number;
  endEvent: number | null;
  label: string | null;
  snapshot: string | null;
  startLine: number | null;
  endLine: number | null;
}

/**
 * SQLite-backed section repository.
 * All methods use prepared statements.
 */
export class SqliteSectionRepository {
  private insertStmt: Database.Statement;
  private findBySessionIdStmt: Database.Statement;
  private deleteBySessionIdStmt: Database.Statement;
  private deleteBySessionIdAndTypeStmt: Database.Statement;
  private deleteByIdStmt: Database.Statement;

  constructor(private db: Database.Database) {
    // Prepare statements once at construction
    this.insertStmt = db.prepare(`
      INSERT INTO sections (id, session_id, type, start_event, end_event, label, snapshot, start_line, end_line)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.findBySessionIdStmt = db.prepare(`
      SELECT * FROM sections
      WHERE session_id = ?
      ORDER BY start_event ASC
    `);

    this.deleteBySessionIdStmt = db.prepare(`
      DELETE FROM sections
      WHERE session_id = ?
    `);

    this.deleteBySessionIdAndTypeStmt = db.prepare(`
      DELETE FROM sections
      WHERE session_id = ? AND type = ?
    `);

    this.deleteByIdStmt = db.prepare(`
      DELETE FROM sections
      WHERE id = ?
    `);
  }

  /**
   * Create a new section.
   * Generates a unique ID using nanoid.
   * Returns the created section with generated fields.
   */
  create(input: CreateSectionInput): SectionRow {
    const id = nanoid();

    this.insertStmt.run(
      id,
      input.sessionId,
      input.type,
      input.startEvent,
      input.endEvent,
      input.label,
      input.snapshot,
      input.startLine,
      input.endLine
    );

    // Retrieve the created section to get generated created_at
    const section = this.db
      .prepare('SELECT * FROM sections WHERE id = ?')
      .get(id) as SectionRow;

    return section;
  }

  /**
   * Find all sections for a session.
   * Returns sections ordered by start_event ASC.
   */
  findBySessionId(sessionId: string): SectionRow[] {
    return this.findBySessionIdStmt.all(sessionId) as SectionRow[];
  }

  /**
   * Delete sections by session ID.
   * Optionally filter by type (marker or detected).
   * Returns count of deleted sections.
   */
  deleteBySessionId(sessionId: string, type?: 'marker' | 'detected'): number {
    if (type) {
      const result = this.deleteBySessionIdAndTypeStmt.run(sessionId, type);
      return result.changes;
    } else {
      const result = this.deleteBySessionIdStmt.run(sessionId);
      return result.changes;
    }
  }

  /**
   * Delete a section by ID.
   * Returns true if a section was deleted, false otherwise.
   */
  deleteById(id: string): boolean {
    const result = this.deleteByIdStmt.run(id);
    return result.changes > 0;
  }
}
