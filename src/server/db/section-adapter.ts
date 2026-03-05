/**
 * Adapter interface for section persistence.
 * This is the abstraction boundary — implementations can swap SQLite for PostgreSQL.
 */

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
 * Adapter for managing section entities.
 * Defines the contract for section data access within a session.
 */
export interface SectionAdapter {
  /**
   * Create a new section.
   * Returns the created section with generated fields (id, created_at).
   */
  create(input: CreateSectionInput): SectionRow;

  /**
   * Find all sections for a session, ordered by start_event ASC.
   */
  findBySessionId(sessionId: string): SectionRow[];

  /**
   * Delete sections by session ID.
   * Optionally filter by type (marker or detected).
   * Returns count of deleted sections.
   */
  deleteBySessionId(sessionId: string, type?: 'marker' | 'detected'): number;

  /**
   * Delete a section by ID.
   * Returns true if deleted, false if not found.
   */
  deleteById(id: string): boolean;
}
