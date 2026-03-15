/**
 * Domain events for the session processing pipeline.
 *
 * Used by both the server (event bus, orchestrator) and the client
 * (SSE event parsing). Keep this type-only — no runtime logic here.
 */

import type { tags } from 'typia';

/**
 * All valid values for the detection_status column.
 * Includes terminal states (pending, processing, completed, failed) and
 * intermediate pipeline stage states written by the orchestrator.
 */
export type DetectionStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'validating'
  | 'detecting'
  | 'replaying'
  | 'deduplicating'
  | 'storing';

/** Named processing stages. Maps to `detection_status` values in the DB. */
export enum PipelineStage {
  Validate = 'validate',
  Detect = 'detect',
  Replay = 'replay',
  Dedup = 'dedup',
  Store = 'store',
}

/**
 * Discriminated union of all pipeline events.
 * The `type` field is the discriminant — narrow with `switch (event.type)`.
 *
 * All `sessionId` fields are non-empty strings. Numeric payload fields
 * carry Typia tags for minimum bounds — these activate when validation
 * middleware (Stage 2b) calls typia.validate() on the event.
 */
export type PipelineEvent =
  | { type: 'session.uploaded';  sessionId: string & tags.MinLength<1>; filename: string & tags.MinLength<1> }
  | { type: 'session.validated'; sessionId: string & tags.MinLength<1>; eventCount: number & tags.Type<'uint32'> & tags.Minimum<0> }
  | { type: 'session.detected';  sessionId: string & tags.MinLength<1>; sectionCount: number & tags.Type<'uint32'> & tags.Minimum<0> }
  | { type: 'session.replayed';  sessionId: string & tags.MinLength<1>; lineCount: number & tags.Type<'uint32'> & tags.Minimum<0> }
  | { type: 'session.deduped';   sessionId: string & tags.MinLength<1>; rawLines: number & tags.Type<'uint32'> & tags.Minimum<0>; cleanLines: number & tags.Type<'uint32'> & tags.Minimum<0> }
  | { type: 'session.ready';     sessionId: string & tags.MinLength<1> }
  | { type: 'session.failed';    sessionId: string & tags.MinLength<1>; stage: PipelineStage; error: string & tags.MinLength<1> }
  | { type: 'session.retrying';  sessionId: string & tags.MinLength<1>; stage: PipelineStage; attempt: number & tags.Type<'uint32'> & tags.Minimum<1> };

/** All possible `type` string values — useful for type-safe handler maps. */
export type PipelineEventType = PipelineEvent['type'];

/** Extract the payload type for a specific event type key. */
export type PipelineEventPayload<T extends PipelineEventType> = Extract<PipelineEvent, { type: T }>;

/**
 * All pipeline event type strings as a runtime array.
 * Used for registering event bus handlers across all pipeline events.
 */
export const ALL_PIPELINE_EVENT_TYPES: PipelineEventType[] = [
  'session.uploaded', 'session.validated', 'session.detected',
  'session.replayed', 'session.deduped', 'session.ready',
  'session.failed', 'session.retrying',
];
