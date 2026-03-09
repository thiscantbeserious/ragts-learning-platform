/**
 * EventBus interface for typed pipeline event publish/subscribe.
 *
 * The interface is intentionally minimal — it covers emit, persistent
 * subscription, one-shot subscription, and unsubscribe. No wildcards,
 * middleware, or ordering guarantees are specified so a future Redis or
 * NATS implementation can satisfy this contract without carrying in-process
 * assumptions.
 */

import type { PipelineEvent, PipelineEventType, PipelineEventPayload } from '../../shared/pipeline_events.js';

/** Handler function for a specific event type — receives the narrowed payload. */
export type EventHandler<T extends PipelineEventType> = (event: PipelineEventPayload<T>) => void;

/** Generic handler that accepts any PipelineEvent — used for internal storage. */
export type AnyEventHandler = (event: PipelineEvent) => void;

/**
 * Typed event bus for pipeline domain events.
 *
 * Implementations must be safe to use with many concurrent SSE connections;
 * the in-process implementation sets a high listener limit accordingly.
 */
export interface EventBus {
  /** Emit an event to all registered handlers for its type. */
  emit(event: PipelineEvent): void;

  /** Register a persistent handler for a specific event type. */
  on<T extends PipelineEventType>(type: T, handler: EventHandler<T>): void;

  /** Remove a previously registered handler. No-op if handler is not registered. */
  off<T extends PipelineEventType>(type: T, handler: EventHandler<T>): void;

  /** Register a one-shot handler that fires exactly once, then removes itself. */
  once<T extends PipelineEventType>(type: T, handler: EventHandler<T>): void;
}
