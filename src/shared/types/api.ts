/**
 * API response shapes shared between server route handlers and client consumers.
 *
 * These interfaces document what the server actually returns over the wire.
 * Both sides import from here to stay in sync.
 */

import type { tags } from 'typia';
import type { AsciicastHeader, Marker } from './asciicast.js';
import type { DetectionStatus } from './pipeline.js';
import type { Section } from './section.js';
import type { TerminalSnapshot } from '#vt-wasm/types';

/**
 * Response shape for GET /api/sessions/:id.
 * Content is stripped to header + markers only (raw events are not sent to the client).
 */
export interface SessionDetailResponse {
  /** Non-empty session identifier. */
  id: string & tags.MinLength<1>;
  /** Non-empty original filename of the .cast file. */
  filename: string & tags.MinLength<1>;
  content: { header: AsciicastHeader; markers: Marker[] };
  /** Session-level terminal snapshot. May arrive as a JSON string or already-parsed object. */
  snapshot?: string | TerminalSnapshot | null;
  sections: Section[];
  detection_status: DetectionStatus;
}

/**
 * Response shape for GET /api/sessions/:id/status.
 * Reflects the current pipeline job state for the session.
 */
export interface SessionStatusResponse {
  /** Non-empty session identifier. */
  sessionId: string & tags.MinLength<1>;
  /** Non-empty current status value. */
  status: string & tags.MinLength<1>;
  currentStage: (string & tags.MinLength<1>) | null;
  /** Current attempt count — 0 or more. */
  attempts: number & tags.Type<'uint32'> & tags.Minimum<0>;
  /** Maximum allowed attempts — at least 1. */
  maxAttempts: number & tags.Type<'uint32'> & tags.Minimum<1>;
  lastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
}
