/**
 * SQLite implementation of SectionAdapter.
 * Manages sections (marker-based and detected) within sessions.
 * Uses prepared statements for performance and safety.
 */

import Database from './node_sqlite_compat.js';
import { nanoid } from 'nanoid';
import type { SectionAdapter, SectionRow, CreateSectionInput } from '../section_adapter.js';

export type { SectionRow, CreateSectionInput } from '../section_adapter.js';

/**
 * SQLite-backed section implementation.
 * All methods use prepared statements.
 */
export class SqliteSectionImpl implements SectionAdapter {
  private readonly insertStmt: Database.Statement;
  private readonly findBySessionIdStmt: Database.Statement;
  private readonly findByIdStmt: Database.Statement;
  private readonly deleteBySessionIdStmt: Database.Statement;
  private readonly deleteBySessionIdAndTypeStmt: Database.Statement;
  private readonly deleteByIdStmt: Database.Statement;

  constructor(db: Database.Database) {
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

    this.findByIdStmt = db.prepare(`
      SELECT * FROM sections WHERE id = ?
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
  async create(input: CreateSectionInput): Promise<SectionRow> {
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
    const section = this.findByIdStmt.get(id) as SectionRow;

    return section;
  }

  /**
   * Find all sections for a session.
   * Returns sections ordered by start_event ASC.
   */
  async findBySessionId(sessionId: string): Promise<SectionRow[]> {
    return this.findBySessionIdStmt.all(sessionId) as SectionRow[];
  }

  /**
   * Delete sections by session ID.
   * Optionally filter by type (marker or detected).
   * Returns count of deleted sections.
   */
  async deleteBySessionId(sessionId: string, type?: 'marker' | 'detected'): Promise<number> {
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
  async deleteById(id: string): Promise<boolean> {
    const result = this.deleteByIdStmt.run(id);
    return result.changes > 0;
  }
}
