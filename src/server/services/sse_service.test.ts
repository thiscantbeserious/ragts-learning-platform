// @vitest-environment node
/**
 * Unit tests for SseService and its standalone helper functions.
 * Covers event bus subscription, event filtering, logId fallback, and missed events query.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  SseService,
  registerSessionHandlers,
  unregisterSessionHandlers,
  getMissedEvents,
  type PendingEvent,
} from './sse_service.js';
import { EmitterEventBusImpl } from '../events/emitter_event_bus_impl.js';
import type { EventLogAdapter, EventLogEntry } from '../events/event_log_adapter.js';
import type { PipelineEvent } from '../../shared/types/pipeline.js';

/** Build a minimal mock EventLogAdapter. */
function makeEventLog(entries: EventLogEntry[] = []): EventLogAdapter {
  return {
    log: vi.fn().mockResolvedValue(undefined),
    logSync: vi.fn().mockReturnValue(1),
    findBySessionId: vi.fn().mockResolvedValue(entries),
    findBySessionIdAfterId: vi.fn().mockResolvedValue(entries),
  };
}

describe('registerSessionHandlers', () => {
  it('buffers events for the matching sessionId', () => {
    const eventBus = new EmitterEventBusImpl();
    const pending: PendingEvent[] = [];

    registerSessionHandlers(eventBus, 'session-A', pending);

    const event: PipelineEvent = { type: 'session.ready', sessionId: 'session-A' };
    eventBus.emit(event);

    expect(pending).toHaveLength(1);
    expect(pending[0]!.event).toEqual(event);
  });

  it('ignores events for a different sessionId', () => {
    const eventBus = new EmitterEventBusImpl();
    const pending: PendingEvent[] = [];

    registerSessionHandlers(eventBus, 'session-A', pending);

    eventBus.emit({ type: 'session.ready', sessionId: 'session-B' });
    expect(pending).toHaveLength(0);
  });

  it('uses 0 as logId fallback when logId is not a number on the event', () => {
    const eventBus = new EmitterEventBusImpl();
    const pending: PendingEvent[] = [];

    registerSessionHandlers(eventBus, 'session-A', pending);

    // Emit an event without a logId property (no logId on the shape)
    const event: PipelineEvent = { type: 'session.ready', sessionId: 'session-A' };
    eventBus.emit(event);

    expect(pending[0]!.logId).toBe(0);
  });

  it('uses the numeric logId when present on the event', () => {
    const eventBus = new EmitterEventBusImpl();
    const pending: PendingEvent[] = [];

    registerSessionHandlers(eventBus, 'session-A', pending);

    // Attach a logId to the emitted event (as the index.ts middleware does)
    const event = { type: 'session.ready', sessionId: 'session-A', logId: 42 } as unknown as PipelineEvent;
    eventBus.emit(event);

    expect(pending[0]!.logId).toBe(42);
  });
});

describe('unregisterSessionHandlers', () => {
  it('removes all registered handlers so no more events are buffered', () => {
    const eventBus = new EmitterEventBusImpl();
    const pending: PendingEvent[] = [];

    const handlers = registerSessionHandlers(eventBus, 'session-A', pending);
    unregisterSessionHandlers(eventBus, handlers);

    eventBus.emit({ type: 'session.ready', sessionId: 'session-A' });
    expect(pending).toHaveLength(0);
  });
});

describe('getMissedEvents', () => {
  it('delegates to eventLog.findBySessionIdAfterId with the given arguments', async () => {
    const entry: EventLogEntry = {
      id: 5,
      sessionId: 'session-A',
      eventType: 'session.ready',
      stage: null,
      payload: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const eventLog = makeEventLog([entry]);

    const result = await getMissedEvents(eventLog, 'session-A', 3);

    expect(eventLog.findBySessionIdAfterId).toHaveBeenCalledWith('session-A', 3);
    expect(result).toEqual([entry]);
  });
});

describe('SseService class', () => {
  it('registerSessionHandlers via class buffers events', () => {
    const eventBus = new EmitterEventBusImpl();
    const eventLog = makeEventLog();
    const service = new SseService({ eventBus, eventLog });

    const pending: PendingEvent[] = [];
    service.registerSessionHandlers('session-A', pending);

    eventBus.emit({ type: 'session.ready', sessionId: 'session-A' });
    expect(pending).toHaveLength(1);
  });

  it('unregisterSessionHandlers via class stops buffering', () => {
    const eventBus = new EmitterEventBusImpl();
    const eventLog = makeEventLog();
    const service = new SseService({ eventBus, eventLog });

    const pending: PendingEvent[] = [];
    const handlers = service.registerSessionHandlers('session-A', pending);
    service.unregisterSessionHandlers(handlers);

    eventBus.emit({ type: 'session.ready', sessionId: 'session-A' });
    expect(pending).toHaveLength(0);
  });

  it('getMissedEvents via class returns entries from the log', async () => {
    const entry: EventLogEntry = {
      id: 10,
      sessionId: 'session-A',
      eventType: 'session.validated',
      stage: null,
      payload: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const eventLog = makeEventLog([entry]);
    const service = new SseService({ eventBus: new EmitterEventBusImpl(), eventLog });

    const result = await service.getMissedEvents('session-A', 9);
    expect(result).toEqual([entry]);
  });
});
