// @vitest-environment node
/**
 * Tests for GET /api/events?sessionId=<id> endpoint.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Hono } from 'hono';
import { SqliteDatabaseImpl } from '../db/sqlite/sqlite_database_impl.js';
import type { DatabaseContext } from '../db/database_adapter.js';
import type { SessionAdapter } from '../db/session_adapter.js';
import type { EventLogAdapter } from '../events/event_log_adapter.js';
import type { PipelineEvent } from '../../shared/pipeline_events.js';
import { PipelineStage } from '../../shared/pipeline_events.js';
import { handleGetEventLog } from './event-log.js';

describe('GET /api/events', () => {
  let testDir: string;
  let app: Hono;
  let ctx: DatabaseContext;
  let sessionRepository: SessionAdapter;
  let eventLog: EventLogAdapter;
  let sessionId: string;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'ragts-eventlog-test-'));
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: testDir });
    sessionRepository = ctx.sessionRepository;
    eventLog = ctx.eventLog;

    const session = await sessionRepository.createWithId('test-session-id', {
      filename: 'test.cast',
      filepath: '/tmp/test.cast',
      size_bytes: 100,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });
    sessionId = session.id;

    app = new Hono();
    app.get('/api/events', (c) => handleGetEventLog(c, sessionRepository, eventLog));
  });

  afterEach(async () => {
    await ctx.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns 400 if sessionId query param is missing', async () => {
    const req = new Request('http://localhost/api/events');
    const res = await app.fetch(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('returns 404 for non-existent session', async () => {
    const req = new Request('http://localhost/api/events?sessionId=nonexistent');
    const res = await app.fetch(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('not found');
  });

  it('returns empty array for session with no events (pre-upgrade)', async () => {
    const req = new Request(`http://localhost/api/events?sessionId=${sessionId}`);
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it('returns chronological list of events for a session', async () => {
    const events: PipelineEvent[] = [
      { type: 'session.validated', sessionId, eventCount: 10 },
      { type: 'session.detected', sessionId, sectionCount: 3 },
      { type: 'session.ready', sessionId },
    ];
    for (const event of events) {
      await eventLog.log(event);
    }

    const req = new Request(`http://localhost/api/events?sessionId=${sessionId}`);
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(3);
  });

  it('each event includes id, eventType, stage, payload, createdAt', async () => {
    await eventLog.log({ type: 'session.validated', sessionId, eventCount: 5 });

    const req = new Request(`http://localhost/api/events?sessionId=${sessionId}`);
    const res = await app.fetch(req);
    const body = await res.json();
    const event = body[0];
    expect(event).toHaveProperty('id');
    expect(event).toHaveProperty('eventType');
    expect(event).toHaveProperty('stage');
    expect(event).toHaveProperty('payload');
    expect(event).toHaveProperty('createdAt');
  });

  it('returns events in chronological order (by id ascending)', async () => {
    await eventLog.log({ type: 'session.validated', sessionId, eventCount: 1 });
    await eventLog.log({ type: 'session.detected', sessionId, sectionCount: 2 });
    await eventLog.log({ type: 'session.ready', sessionId });

    const req = new Request(`http://localhost/api/events?sessionId=${sessionId}`);
    const res = await app.fetch(req);
    const body = await res.json();
    const types = body.map((e: { eventType: string }) => e.eventType);
    expect(types).toEqual([
      'session.validated',
      'session.detected',
      'session.ready',
    ]);
  });

  it('includes stage name for session.failed events', async () => {
    await eventLog.log({
      type: 'session.failed',
      sessionId,
      stage: PipelineStage.Detect,
      error: 'Detection failed',
    });

    const req = new Request(`http://localhost/api/events?sessionId=${sessionId}`);
    const res = await app.fetch(req);
    const body = await res.json();
    expect(body[0].stage).toBe(PipelineStage.Detect);
  });

  it('does not return events for other sessions', async () => {
    await sessionRepository.createWithId('other-session', {
      filename: 'other.cast',
      filepath: '/tmp/other.cast',
      size_bytes: 50,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });
    await eventLog.log({ type: 'session.ready', sessionId: 'other-session' });
    await eventLog.log({ type: 'session.ready', sessionId });

    const req = new Request(`http://localhost/api/events?sessionId=${sessionId}`);
    const res = await app.fetch(req);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].eventType).toBe('session.ready');
  });
});
