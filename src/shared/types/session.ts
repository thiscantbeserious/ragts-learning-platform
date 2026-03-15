/**
 * Session domain types.
 * Used by both client and server for type safety across the stack.
 */

import type { tags } from 'typia';

/**
 * Session entity - represents an uploaded asciicast v3 recording.
 * Stored in SQLite with metadata, file content lives on filesystem.
 */
export interface Session {
  /** Non-empty nanoid string identifier. */
  id: string & tags.MinLength<1>;
  /** Non-empty filename of the original .cast file. */
  filename: string & tags.MinLength<1>;
  /** Non-empty filesystem path to the stored .cast file. */
  filepath: string & tags.MinLength<1>;
  /**
   * File size in bytes — must be at least 1 (empty files are invalid).
   * uint32 not used here: recordings can exceed 4GB on large sessions.
   */
  size_bytes: number & tags.Minimum<1>;
  /** Number of marker events — 0 or more. */
  marker_count: number & tags.Type<'uint32'> & tags.Minimum<0>;
  /** ISO 8601 upload timestamp. */
  uploaded_at: string & tags.MinLength<1>;
  /** ISO 8601 creation timestamp. */
  created_at: string & tags.MinLength<1>;
  agent_type?: string | null;
  event_count?: number | null;
  detected_sections_count?: number | null;
  detection_status?: 'pending' | 'processing' | 'queued' | 'validating' | 'detecting' | 'replaying' | 'deduplicating' | 'storing' | 'completed' | 'failed' | 'interrupted';
  snapshot?: string | null;  // Full getAllLines() JSON from VT terminal
}

/**
 * Data required to create a new session.
 * Omits generated fields (id, timestamps).
 */
export interface SessionCreate {
  /** Non-empty filename of the original .cast file. */
  filename: string & tags.MinLength<1>;
  /** Non-empty filesystem path to the stored .cast file. */
  filepath: string & tags.MinLength<1>;
  /**
   * File size in bytes — must be at least 1 (empty files are invalid).
   * uint32 not used here: recordings can exceed 4GB on large sessions.
   */
  size_bytes: number & tags.Minimum<1>;
  /** Number of marker events — 0 or more. */
  marker_count: number & tags.Type<'uint32'> & tags.Minimum<0>;
  /** ISO 8601 upload timestamp. */
  uploaded_at: string & tags.MinLength<1>;
}
