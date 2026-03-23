/**
 * Adapter interface for section persistence.
 * This is the abstraction boundary — implementations can swap SQLite for PostgreSQL.
 */

/**
 * Section row from database.
 * Matches the sections table schema (including columns added by migration 005).
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
  /** Precomputed line count. Null on legacy rows before migration 005 backfill. */
  line_count: number | null;
  /** Truncated SHA-256 of snapshot content (16 hex chars). Null on legacy rows. */
  content_hash: string | null;
  /** First non-empty line or summary text for navigator display (VISIONBOOK item 5). */
  preview: string | null;
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
  /**
   * Precomputed line count stored alongside the section.
   * Optional — completeProcessing computes this from the snapshot when null.
   */
  lineCount?: number | null;
  /**
   * Truncated SHA-256 of snapshot content (16 hex chars).
   * Optional — completeProcessing computes this from the snapshot when null.
   */
  contentHash?: string | null;
  /** Preview text for navigator display (VISIONBOOK item 5). Nullable. */
  preview?: string | null;
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
  create(input: CreateSectionInput): Promise<SectionRow>;

  /**
   * Find all sections for a session, ordered by start_event ASC.
   */
  findBySessionId(sessionId: string): Promise<SectionRow[]>;

  /**
   * Find a single section by its unique ID.
   * Returns null if no matching section exists.
   */
  findById(id: string): Promise<SectionRow | null>;

  /**
   * Delete sections by session ID.
   * Optionally filter by type (marker or detected).
   * Returns count of deleted sections.
   */
  deleteBySessionId(sessionId: string, type?: 'marker' | 'detected'): Promise<number>;

  /**
   * Delete a section by ID.
   * Returns true if deleted, false if not found.
   */
  deleteById(id: string): Promise<boolean>;
}
