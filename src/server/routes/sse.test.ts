// @vitest-environment node
/**
 * Tests for GET /api/sessions/:id/events SSE endpoint.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Hono } from 'hono';
import { SqliteDatabaseImpl } from '../db/sqlite/sqlite_database_impl.js';
import type { DatabaseContext } from '../db/database_adapter.js';
import type { SessionAdapter } from '../db/session_adapter.js';
import type { EventLogAdapter } from '../events/event_log_adapter.js';
import { EmitterEventBusImpl } from '../events/emitter_event_bus_impl.js';
import type { PipelineEvent } from '../../shared/pipeline_events.js';
import { handleSseEvents } from './sse.js';

/** Parse raw SSE text into structured event objects. */
function parseSseText(text: string): Array<{ event?: string; data?: string; id?: string }> {
  const events: Array<{ event?: string; data?: string; id?: string }> = [];
  const blocks = text.split(/\n\n+/).filter(Boolean);
  for (const block of blocks) {
    if (block.trim().startsWith(':')) continue; // comment (keepalive)
    const entry: { event?: string; data?: string; id?: string } = {};
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) entry.event = line.slice(6).trim();
      else if (line.startsWith('data:')) entry.data = line.slice(5).trim();
      else if (line.startsWith('id:')) entry.id = line.slice(3).trim();
    }
    if (entry.data !== undefined || entry.event !== undefined) {
      events.push(entry);
    }
  }
  return events;
}

describe('GET /api/sessions/:id/events (SSE)', () => {
  let testDir: string;
  let app: Hono;
  let ctx: DatabaseContext;
  let sessionRepository: SessionAdapter;
  let eventLog: EventLogAdapter;
  let eventBus: EmitterEventBusImpl;
  let sessionId: string;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'ragts-sse-test-'));
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: testDir });
    sessionRepository = ctx.sessionRepository;
    eventLog = ctx.eventLog;

    // Create a real session for tests
    const session = await sessionRepository.createWithId('test-session-id', {
      filename: 'test.cast',
      filepath: '/tmp/test.cast',
      size_bytes: 100,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });
    sessionId = session.id;

    eventBus = new EmitterEventBusImpl();

    app = new Hono();
    app.get('/api/sessions/:id/events', (c) =>
      handleSseEvents(c, sessionRepository, eventBus, eventLog)
    );
  });

  afterEach(async () => {
    await ctx.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns 404 for non-existent session', async () => {
    const req = new Request('http://localhost/api/sessions/nonexistent/events');
    const res = await app.fetch(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('not found');
  });

  it('returns Content-Type: text/event-stream', async () => {
    // Emit a terminal event immediately so the stream closes
    setImmediate(() => {
      eventBus.emit({ type: 'session.ready', sessionId });
    });

    const req = new Request(`http://localhost/api/sessions/${sessionId}/events`);
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    // Consume the body so the stream is fully closed before the next test
    await res.text();
  });

  it('sets Cache-Control: no-cache', async () => {
    setImmediate(() => {
      eventBus.emit({ type: 'session.ready', sessionId });
    });

    const req = new Request(`http://localhost/api/sessions/${sessionId}/events`);
    const res = await app.fetch(req);
    expect(res.headers.get('cache-control')).toBe('no-cache');
    // Consume the body so the stream is fully closed before the next test
    await res.text();
  });

  it('streams pipeline events for the session', async () => {
    setImmediate(() => {
      eventBus.emit({ type: 'session.validated', sessionId, eventCount: 42 });
      eventBus.emit({ type: 'session.ready', sessionId });
    });

    const req = new Request(`http://localhost/api/sessions/${sessionId}/events`);
    const res = await app.fetch(req);
    expect(res.status).toBe(200);

    const text = await res.text();
    const events = parseSseText(text);
    const types = events.map(e => e.event);
    expect(types).toContain('session.validated');
    expect(types).toContain('session.ready');
  });

  it('does not stream events for other sessions', async () => {
    // Create a second session
    await sessionRepository.createWithId('other-session', {
      filename: 'other.cast',
      filepath: '/tmp/other.cast',
      size_bytes: 100,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    setImmediate(() => {
      // Emit for a different session — should not appear in our stream
      eventBus.emit({ type: 'session.validated', sessionId: 'other-session', eventCount: 1 });
      // Then close our session
      eventBus.emit({ type: 'session.ready', sessionId });
    });

    const req = new Request(`http://localhost/api/sessions/${sessionId}/events`);
    const res = await app.fetch(req);
    const text = await res.text();
    const events = parseSseText(text);
    const otherSessionEvents = events.filter(e => {
      try {
        const payload = JSON.parse(e.data ?? '{}');
        return payload.sessionId === 'other-session';
      } catch {
        return false;
      }
    });
    expect(otherSessionEvents).toHaveLength(0);
  });

  it('closes the stream when session reaches ready state', async () => {
    setImmediate(() => {
      eventBus.emit({ type: 'session.ready', sessionId });
    });

    const req = new Request(`http://localhost/api/sessions/${sessionId}/events`);
    const res = await app.fetch(req);
    expect(res.status).toBe(200);

    // Should be able to read without hanging
    const text = await res.text();
    const events = parseSseText(text);
    expect(events.some(e => e.event === 'session.ready')).toBe(true);
  });

  it('closes the stream when session reaches failed state', async () => {
    const { PipelineStage } = await import('../../shared/pipeline_events.js');
    setImmediate(() => {
      eventBus.emit({
        type: 'session.failed',
        sessionId,
        stage: PipelineStage.Validate,
        error: 'Something went wrong',
      });
    });

    const req = new Request(`http://localhost/api/sessions/${sessionId}/events`);
    const res = await app.fetch(req);
    const text = await res.text();
    const events = parseSseText(text);
    expect(events.some(e => e.event === 'session.failed')).toBe(true);
  });

  it('replays missed events on reconnect using Last-Event-ID', async () => {
    // Pre-populate event log with some events
    const event1: PipelineEvent = { type: 'session.validated', sessionId, eventCount: 10 };
    const event2: PipelineEvent = { type: 'session.detected', sessionId, sectionCount: 3 };
    await eventLog.log(event1);
    await eventLog.log(event2);

    // Get the stored IDs
    const entries = await eventLog.findBySessionId(sessionId);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    const firstId = entries[0]!.id;

    // Reconnect with Last-Event-ID = firstId (should replay events after firstId)
    setImmediate(() => {
      eventBus.emit({ type: 'session.ready', sessionId });
    });

    const req = new Request(`http://localhost/api/sessions/${sessionId}/events`, {
      headers: { 'Last-Event-ID': String(firstId) },
    });
    const res = await app.fetch(req);
    const text = await res.text();
    const events = parseSseText(text);

    // Should have replayed event2 (detected) and then the live ready event
    const eventTypes = events.map(e => e.event);
    expect(eventTypes).toContain('session.detected');
    expect(eventTypes).toContain('session.ready');
    // Should NOT have replayed event1 since Last-Event-ID was its ID
    const validatedEvents = events.filter(e => e.event === 'session.validated');
    expect(validatedEvents).toHaveLength(0);
  });

  it('includes SSE id field from event log entry', async () => {
    // Pre-populate event log
    await eventLog.log({ type: 'session.validated', sessionId, eventCount: 5 });
    const entries = await eventLog.findBySessionId(sessionId);

    setImmediate(() => {
      eventBus.emit({ type: 'session.ready', sessionId });
    });

    // Reconnect from before all events (id = 0)
    const req = new Request(`http://localhost/api/sessions/${sessionId}/events`, {
      headers: { 'Last-Event-ID': '0' },
    });
    const res = await app.fetch(req);
    const text = await res.text();
    const events = parseSseText(text);

    // Replayed events should have id field set
    const replayed = events.find(e => e.event === 'session.validated');
    expect(replayed).toBeDefined();
    expect(replayed?.id).toBe(String(entries[0]!.id));
  });
});
