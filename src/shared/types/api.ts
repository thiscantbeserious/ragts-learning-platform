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
import type { SnapshotLine, TerminalSnapshot } from '#vt-wasm/types';

/** Non-empty string. */
type NonEmptyString = string & tags.MinLength<1>;

/** Non-negative uint32. */
type UInt32 = number & tags.Type<'uint32'> & tags.Minimum<0>;

/** Positive uint32 (at least 1). */
type PositiveUInt32 = number & tags.Type<'uint32'> & tags.Minimum<1>;

/**
 * Response shape for GET /api/sessions/:id.
 * Content is stripped to header + markers only (raw events are not sent to the client).
 *
 * @deprecated Use SessionMetadataResponse for new consumers.
 * Preserved for backward compatibility during migration.
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
 * Section metadata as returned by the metadata-only session endpoint.
 * Contains all fields needed for navigator rendering without snapshot content.
 * CLI sections have startLine/endLine; TUI sections have null for both.
 */
export interface SectionMetadata {
  /** Non-empty unique section identifier. */
  id: NonEmptyString;
  type: 'marker' | 'detected';
  /** Non-empty human-readable label. */
  label: NonEmptyString;
  /** Index of the first event in this section — 0 or greater. */
  startEvent: UInt32;
  /** Index of the last event in this section — 0 or greater. */
  endEvent: UInt32;
  /** CLI sections — first line index in the session snapshot. Null for TUI sections. */
  startLine: UInt32 | null;
  /** CLI sections — last line index in the session snapshot. Null for TUI sections. */
  endLine: UInt32 | null;
  /** Total number of lines in this section — 0 or greater. */
  lineCount: UInt32;
  /**
   * Optional first-line preview text for navigator tooltips (VISIONBOOK item 5).
   * Null when not yet populated by the pipeline.
   */
  preview: string | null;
}

/**
 * A page of terminal snapshot lines for a single section.
 *
 * Returned by both the per-section content endpoint and as entries within
 * BulkSectionContentResponse. The limit field accepts numbers or the string
 * sentinel "all" to indicate an unrestricted full-content request.
 *
 * contentHash is a stable hash of the section's full content (not per-chunk),
 * suitable for use as an ETag base value.
 */
export interface SectionContentPage {
  /** Non-empty section identifier. */
  sectionId: NonEmptyString;
  /** Array of terminal snapshot lines for this page. */
  lines: SnapshotLine[];
  /** Total number of lines in the section (across all pages). */
  totalLines: UInt32;
  /** Zero-based line offset this page starts at. */
  offset: UInt32;
  /**
   * Maximum lines requested.
   * A number represents a fixed page size; "all" requests the full section content.
   */
  limit: number | 'all';
  /** True when more lines are available beyond this page. */
  hasMore: boolean;
  /** Stable hash of the section's full content, used for ETag generation. */
  contentHash: NonEmptyString;
}

/**
 * Response shape for GET /api/sessions/:id/sections/content (bulk endpoint).
 * Maps section IDs to their content pages. Each entry has the same structure as
 * the per-section content endpoint, but all sections are batched into one response.
 */
export interface BulkSectionContentResponse {
  sections: Record<string, SectionContentPage>;
}

/**
 * Response shape for GET /api/sessions/:id (metadata-only, post-migration).
 * Omits snapshot content — terminal line data is fetched separately via
 * the per-section or bulk content endpoints.
 */
export interface SessionMetadataResponse {
  /** Non-empty session identifier. */
  id: NonEmptyString;
  /** Non-empty original filename of the .cast file. */
  filename: NonEmptyString;
  content: { header: AsciicastHeader; markers: Marker[] };
  /** Section metadata array — no snapshot content, suitable for navigator rendering. */
  sections: SectionMetadata[];
  detection_status: DetectionStatus;
  /** Total line count across all sections — sum of section lineCount values. */
  totalLines: UInt32;
  /** Number of sections in this session. */
  sectionCount: UInt32;
}

/**
 * Response shape for GET /api/sessions/:id/snapshot.
 * Returns the session-level terminal snapshot for 0-section sessions.
 * Used as a fallback when section boundaries were not detected.
 */
export interface SessionSnapshotResponse {
  /** Non-empty session identifier. */
  id: NonEmptyString;
  /** Full terminal snapshot — may be null when no snapshot is stored. */
  snapshot: TerminalSnapshot | null;
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
