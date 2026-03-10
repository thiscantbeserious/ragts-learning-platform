/**
 * SSE endpoint for real-time pipeline event streaming.
 *
 * Subscribes to the EventBusAdapter for a single session and streams
 * events as Server-Sent Events. Closes automatically when the session
 * reaches a terminal state (session.ready or session.failed).
 *
 * Supports reconnection via Last-Event-ID header: replays missed events
 * from the EventLogAdapter before switching to live streaming.
 *
 * Connections: SessionAdapter (db/), EventBusAdapter (events/),
 * EventLogAdapter (events/).
 */

import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { SessionAdapter } from '../db/session_adapter.js';
import type { EventBusAdapter } from '../events/event_bus_adapter.js';
import type { EventLogAdapter } from '../events/event_log_adapter.js';
import type { PipelineEventType } from '../../shared/types/pipeline.js';
import {
  registerSessionHandlers,
  unregisterSessionHandlers,
  getMissedEvents,
  type PendingEvent,
} from '../services/index.js';
import { startKeepalive } from '../utils/sse_keepalive.js';
import { acquireConnection, releaseConnection } from '../utils/sse_connections.js';

/** Terminal event types that close the SSE stream. */
const TERMINAL_TYPES = new Set<PipelineEventType>(['session.ready', 'session.failed']);

/** Minimal SSE message shape accepted by streamSSE. */
interface SseMessage {
  id?: string;
  event?: string;
  data: string;
}

/**
 * Handle GET /api/sessions/:id/events — SSE stream of pipeline events.
 * Returns 404 if the session does not exist.
 *
 * NOTE: Event bus handlers are registered synchronously BEFORE any async
 * session lookup to avoid a race condition where events are emitted between
 * the await and the handler registration.
 */
export async function handleSseEvents(
  c: Context,
  sessionRepository: SessionAdapter,
  eventBus: EventBusAdapter,
  eventLog: EventLogAdapter
): Promise<Response> {
  const id = c.req.param('id');

  if (!acquireConnection(id)) {
    return c.json({ error: 'Too many SSE connections' }, 429);
  }

  const { notify, waitForEvent } = createNotifier();
  const pendingLive: PendingEvent[] = [];
  const handlers = registerSessionHandlers(eventBus, id, pendingLive, notify);

  const session = await sessionRepository.findById(id);
  if (!session) {
    unregisterSessionHandlers(eventBus, handlers);
    releaseConnection(id);
    return c.json({ error: 'Session not found' }, 404);
  }

  const lastEventId = c.req.header('Last-Event-ID');

  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');

  return streamSSE(c, async (stream) => {
    let released = false;
    const cleanup = () => {
      if (released) return;
      released = true;
      unregisterSessionHandlers(eventBus, handlers);
      releaseConnection(id);
    };
    try {
      const replayed = await replayMissedEvents(stream, eventLog, id, lastEventId, cleanup);
      if (replayed) return;

      await drainAndListen(stream, pendingLive, cleanup, waitForEvent);
    } catch {
      cleanup();
    }
  });
}

/**
 * Replays missed events from the event log for a reconnecting client.
 * Returns true if a terminal event was replayed (stream should be closed after).
 */
async function replayMissedEvents(
  stream: { writeSSE: (msg: SseMessage) => Promise<void>; closed: boolean },
  eventLog: EventLogAdapter,
  sessionId: string,
  lastEventId: string | undefined,
  cleanup: () => void
): Promise<boolean> {
  if (lastEventId === undefined) return false;

  const afterId = Number.parseInt(lastEventId, 10);
  if (Number.isNaN(afterId)) return false;

  const missed = await getMissedEvents(eventLog, sessionId, afterId);
  for (const entry of missed) {
    if (stream.closed) { cleanup(); return true; }
    await stream.writeSSE({
      id: String(entry.id),
      event: entry.eventType,
      data: entry.payload ?? '{}',
    });
    if (TERMINAL_TYPES.has(entry.eventType as PipelineEventType)) {
      cleanup();
      return true;
    }
  }
  return false;
}

/**
 * Creates a notifier pair: notify() resolves the next waitForEvent() promise.
 * Used to wake the SSE drain loop instantly when a new event is pushed.
 */
function createNotifier(): { notify: () => void; waitForEvent: () => Promise<void> } {
  let resolve: (() => void) | null = null;

  return {
    notify: () => { if (resolve) { resolve(); resolve = null; } },
    waitForEvent: () => {
      if (resolve) return Promise.resolve();
      return new Promise<void>((r) => { resolve = r; });
    },
  };
}

/**
 * Drain buffered live events and keep listening until terminal state or disconnect.
 * Processes all buffered events first, then waits for event-driven wakeup (no polling).
 */
async function drainAndListen(
  stream: { writeSSE: (msg: SseMessage) => Promise<void>; closed: boolean },
  pending: PendingEvent[],
  cleanup: () => void,
  waitForEvent: () => Promise<void>
): Promise<void> {
  const stopKeepalive = startKeepalive(stream, cleanup);

  try {
    while (true) {
      if (stream.closed) break;

      while (pending.length > 0) {
        const { event, logId } = pending.shift()!;
        if (stream.closed) break;
        await stream.writeSSE({ id: String(logId), event: event.type, data: JSON.stringify(event) });
        if (TERMINAL_TYPES.has(event.type)) return;
      }

      if (stream.closed) break;
      await waitForEvent();
    }
  } finally {
    stopKeepalive();
    cleanup();
  }
}
