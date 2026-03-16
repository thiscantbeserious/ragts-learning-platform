/**
 * Pipeline status types shared between the server SSE endpoint
 * and the client usePipelineStatus composable.
 *
 * These types describe the aggregate pipeline state broadcast over
 * GET /api/pipeline/status — no internal infrastructure data is included.
 */

import type { DetectionStatus } from './pipeline.js';

/**
 * A session entry in the pipeline status snapshot.
 * Contains only user-visible fields — no worker counts, memory, or thread info.
 */
export interface PipelineSession {
  /** Non-empty session identifier. */
  id: string;
  /** Non-empty filename of the uploaded .cast file. */
  name: string;
  /** Current detection status of the session. */
  status: DetectionStatus;
  /** Position in queue — present only for queued sessions. */
  queuePosition?: number;
  /** Optional progress percentage (0-100) — present when stage progress is tracked. */
  progress?: number;
  /** ISO 8601 timestamp of when the session completed — present only for recentlyCompleted. */
  completedAt?: string;
}

/**
 * The aggregate pipeline state snapshot broadcast by GET /api/pipeline/status.
 * Emitted on initial connection and on every state change.
 */
export interface PipelineStatusSnapshot {
  /** Sessions actively processing through the pipeline. */
  processing: PipelineSession[];
  /** Sessions waiting to be processed, ordered by queue position. */
  queued: PipelineSession[];
  /** Sessions that completed in the last 5 minutes. */
  recentlyCompleted: PipelineSession[];
}

/** SSE event payload format for the pipeline status stream. */
export interface PipelineStatusEvent {
  type: 'pipeline-status';
  data: PipelineStatusSnapshot;
}
