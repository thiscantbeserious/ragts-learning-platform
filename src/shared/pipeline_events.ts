/**
 * Domain events for the session processing pipeline.
 *
 * Used by both the server (event bus, orchestrator) and the client
 * (SSE event parsing). Keep this type-only — no runtime logic here.
 */

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
 */
export type PipelineEvent =
  | { type: 'session.uploaded';  sessionId: string; filename: string }
  | { type: 'session.validated'; sessionId: string; eventCount: number }
  | { type: 'session.detected';  sessionId: string; sectionCount: number }
  | { type: 'session.replayed';  sessionId: string; lineCount: number }
  | { type: 'session.deduped';   sessionId: string; rawLines: number; cleanLines: number }
  | { type: 'session.ready';     sessionId: string }
  | { type: 'session.failed';    sessionId: string; stage: string; error: string }
  | { type: 'session.retrying';  sessionId: string; stage: string; attempt: number };

/** All possible `type` string values — useful for type-safe handler maps. */
export type PipelineEventType = PipelineEvent['type'];

/** Extract the payload type for a specific event type key. */
export type PipelineEventPayload<T extends PipelineEventType> = Extract<PipelineEvent, { type: T }>;
