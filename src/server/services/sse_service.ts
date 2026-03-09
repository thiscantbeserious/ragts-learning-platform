/**
 * SseService: event replay (Last-Event-ID) and live subscription helpers.
 *
 * Registers per-session event bus handlers for buffered live delivery,
 * and queries the event log for missed events on reconnect.
 *
 * Connections: EventLogAdapter (events/), EventBusAdapter (events/).
 */

import type { EventBusAdapter, EventHandler } from '../events/event_bus_adapter.js';
import type { EventLogAdapter, EventLogEntry } from '../events/event_log_adapter.js';
import type { PipelineEvent, PipelineEventType } from '../../shared/types/pipeline.js';
import { ALL_PIPELINE_EVENT_TYPES } from '../../shared/types/pipeline.js';

/** A buffered live event paired with its persisted event log row ID for SSE `id` field. */
export interface PendingEvent {
  event: PipelineEvent;
  logId: number;
}

export interface SseServiceDeps {
  eventBus: EventBusAdapter;
  eventLog: EventLogAdapter;
}

/**
 * SseService manages event bus subscriptions and log queries for SSE streaming.
 */
export class SseService {
  private readonly eventBus: EventBusAdapter;
  private readonly eventLog: EventLogAdapter;

  constructor(deps: SseServiceDeps) {
    this.eventBus = deps.eventBus;
    this.eventLog = deps.eventLog;
  }

  /**
   * Register event bus handlers for a session synchronously, buffering events into pending.
   * Must be called synchronously before any awaits to avoid missing events emitted during
   * async session lookup.
   */
  registerSessionHandlers(
    sessionId: string,
    pending: PendingEvent[]
  ): Map<PipelineEventType, (event: PipelineEvent) => void> {
    return registerSessionHandlers(this.eventBus, sessionId, pending);
  }

  /** Remove all registered event bus handlers. */
  unregisterSessionHandlers(
    handlers: Map<PipelineEventType, (event: PipelineEvent) => void>
  ): void {
    unregisterSessionHandlers(this.eventBus, handlers);
  }

  /** Returns events from the log with id strictly greater than afterId. */
  async getMissedEvents(sessionId: string, afterId: number): Promise<EventLogEntry[]> {
    return getMissedEvents(this.eventLog, sessionId, afterId);
  }
}

/**
 * Register event bus handlers for a session synchronously, buffering events into pending.
 * Each buffered entry includes the event log row ID (set by the log handler in index.ts
 * before this handler fires) so the SSE stream can include it as the `id` field.
 */
export function registerSessionHandlers(
  eventBus: EventBusAdapter,
  sessionId: string,
  pending: PendingEvent[]
): Map<PipelineEventType, (event: PipelineEvent) => void> {
  const handlers = new Map<PipelineEventType, (event: PipelineEvent) => void>();
  for (const type of ALL_PIPELINE_EVENT_TYPES) {
    const handler = (event: PipelineEvent) => {
      if (event.sessionId === sessionId) {
        const logId = (event as Record<string, unknown>)['logId'];
        pending.push({ event, logId: typeof logId === 'number' ? logId : 0 });
      }
    };
    handlers.set(type, handler);
    eventBus.on(type, handler as EventHandler<typeof type>);
  }
  return handlers;
}

/** Remove all registered event bus handlers. */
export function unregisterSessionHandlers(
  eventBus: EventBusAdapter,
  handlers: Map<PipelineEventType, (event: PipelineEvent) => void>
): void {
  for (const [type, handler] of handlers) {
    eventBus.off(type, handler as EventHandler<typeof type>);
  }
}

/** Returns events from the log with id strictly greater than afterId. */
export async function getMissedEvents(
  eventLog: EventLogAdapter,
  sessionId: string,
  afterId: number
): Promise<EventLogEntry[]> {
  return eventLog.findBySessionIdAfterId(sessionId, afterId);
}
