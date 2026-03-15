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

/** Non-empty string. */
type NonEmptyString = string & tags.MinLength<1>;

/** Non-negative uint32. */
type UInt32 = number & tags.Type<'uint32'> & tags.Minimum<0>;

/** Positive uint32 (at least 1). */
type PositiveUInt32 = number & tags.Type<'uint32'> & tags.Minimum<1>;

/**
 * Response shape for GET /api/sessions/:id.
 * Content is stripped to header + markers only (raw events are not sent to the client).
 */
export interface SessionDetailResponse {
  /** Non-empty session identifier. */
  id: NonEmptyString;
  /** Non-empty original filename of the .cast file. */
  filename: NonEmptyString;
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
  sessionId: NonEmptyString;
  /** Non-empty current status value. */
  status: NonEmptyString;
  currentStage: NonEmptyString | null;
  /** Current attempt count — 0 or more. */
  attempts: UInt32;
  /** Maximum allowed attempts — at least 1. */
  maxAttempts: PositiveUInt32;
  lastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
}
