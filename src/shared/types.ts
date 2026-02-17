/**
 * Shared types for RAGTS platform.
 * Used by both client and server for type safety across the stack.
 */

/**
 * Session entity - represents an uploaded asciicast v3 recording.
 * Stored in SQLite with metadata, file content lives on filesystem.
 */
export interface Session {
  id: string;
  filename: string;
  filepath: string;
  size_bytes: number;
  marker_count: number;
  uploaded_at: string;
  created_at: string;
  agent_type?: string | null;
  event_count?: number | null;
  detected_sections_count?: number | null;
  detection_status?: 'pending' | 'processing' | 'completed' | 'failed';
}

/**
 * Data required to create a new session.
 * Omits generated fields (id, timestamps).
 */
export interface SessionCreate {
  filename: string;
  filepath: string;
  size_bytes: number;
  marker_count: number;
  uploaded_at: string;
}
