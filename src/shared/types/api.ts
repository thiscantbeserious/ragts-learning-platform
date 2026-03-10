/**
 * API response shapes shared between server route handlers and client consumers.
 *
 * These interfaces document what the server actually returns over the wire.
 * Both sides import from here to stay in sync.
 */

import type { AsciicastHeader, Marker } from './asciicast.js';
import type { DetectionStatus } from './pipeline.js';
import type { Section } from './section.js';
import type { TerminalSnapshot } from '#vt-wasm/types';

/**
 * Response shape for GET /api/sessions/:id.
 * Content is stripped to header + markers only (raw events are not sent to the client).
 */
export interface SessionDetailResponse {
  id: string;
  filename: string;
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
  sessionId: string;
  status: string;
  currentStage: string | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
}
