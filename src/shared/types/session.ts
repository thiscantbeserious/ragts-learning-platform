/**
 * Session domain types.
 * Used by both client and server for type safety across the stack.
 */

import type { tags } from 'typia';

/** Non-negative uint32 — counts, indices, sizes (capped at ~4GB). */
type UInt32 = number & tags.Type<'uint32'> & tags.Minimum<0>;

/** Non-empty string. */
type NonEmptyString = string & tags.MinLength<1>;

/** Positive number (at least 1). */
type PositiveNumber = number & tags.Minimum<1>;

/**
 * Session entity - represents an uploaded asciicast v3 recording.
 * Stored in SQLite with metadata, file content lives on filesystem.
 */
export interface Session {
  /** Non-empty nanoid string identifier. */
  id: NonEmptyString;
  /** Non-empty filename of the original .cast file. */
  filename: NonEmptyString;
  /** Non-empty filesystem path to the stored .cast file. */
  filepath: NonEmptyString;
  /**
   * File size in bytes — must be at least 1 (empty files are invalid).
   * uint32 not used here: recordings can exceed 4GB on large sessions.
   */
  size_bytes: PositiveNumber;
  /** Number of marker events — 0 or more. */
  marker_count: UInt32;
  /** ISO 8601 upload timestamp. */
  uploaded_at: NonEmptyString;
  /** ISO 8601 creation timestamp. */
  created_at: NonEmptyString;
  agent_type?: string | null;
  /** Total event count after validation. 0 or more. */
  event_count?: (UInt32) | null;
  /** Number of detected sections. 0 or more. */
  detected_sections_count?: (UInt32) | null;
  detection_status?: 'pending' | 'processing' | 'queued' | 'validating' | 'detecting' | 'replaying' | 'deduplicating' | 'storing' | 'completed' | 'failed' | 'interrupted';
  snapshot?: string | null;  // Full getAllLines() JSON from VT terminal
}

/**
 * Data required to create a new session.
 * Omits generated fields (id, timestamps).
 */
export interface SessionCreate {
  /** Non-empty filename of the original .cast file. */
  filename: NonEmptyString;
  /** Non-empty filesystem path to the stored .cast file. */
  filepath: NonEmptyString;
  /**
   * File size in bytes — must be at least 1 (empty files are invalid).
   * uint32 not used here: recordings can exceed 4GB on large sessions.
   */
  size_bytes: PositiveNumber;
  /** Number of marker events — 0 or more. */
  marker_count: UInt32;
  /** ISO 8601 upload timestamp. */
  uploaded_at: NonEmptyString;
}
