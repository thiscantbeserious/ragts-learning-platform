// @vitest-environment node
/**
 * Tests for POST /api/sessions/:id/retry endpoint.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Hono } from 'hono';
import { SqliteDatabaseImpl } from '../db/sqlite/sqlite_database_impl.js';
import type { DatabaseContext } from '../db/database_adapter.js';
import type { SessionAdapter } from '../db/session_adapter.js';
import type { JobQueueAdapter } from '../jobs/job_queue_adapter.js';
import { EmitterEventBusImpl } from '../events/emitter_event_bus_impl.js';
import { PipelineStage } from '../../shared/pipeline_events.js';
import { handleRetry } from './retry.js';

describe('POST /api/sessions/:id/retry', () => {
  let testDir: string;
  let app: Hono;
  let ctx: DatabaseContext;
  let sessionRepository: SessionAdapter;
  let jobQueue: JobQueueAdapter;
  let eventBus: EmitterEventBusImpl;
  let sessionId: string;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'ragts-retry-test-'));
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: testDir });
    sessionRepository = ctx.sessionRepository;
    jobQueue = ctx.jobQueue;

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
    app.post('/api/sessions/:id/retry', (c) =>
      handleRetry(c, sessionRepository, jobQueue, eventBus)
    );
  });

  afterEach(async () => {
    await ctx.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns 404 for non-existent session', async () => {
    const req = new Request('http://localhost/api/sessions/nonexistent/retry', {
      method: 'POST',
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('not found');
  });

  it('returns 400 if no job exists (no failed/interrupted state to retry)', async () => {
    const req = new Request(`http://localhost/api/sessions/${sessionId}/retry`, {
      method: 'POST',
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('returns 400 if job is pending (not failed or interrupted)', async () => {
    await jobQueue.create(sessionId);

    const req = new Request(`http://localhost/api/sessions/${sessionId}/retry`, {
      method: 'POST',
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(400);
  });

  it('returns 409 if job is already running', async () => {
    const job = await jobQueue.create(sessionId);
    await jobQueue.start(job.id);

    const req = new Request(`http://localhost/api/sessions/${sessionId}/retry`, {
      method: 'POST',
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('starts retry for a failed job', async () => {
    const job = await jobQueue.create(sessionId);
    await jobQueue.start(job.id);
    await jobQueue.fail(job.id, 'Test failure');

    const emittedEvents: string[] = [];
    eventBus.on('session.uploaded', (e) => emittedEvents.push(e.type));

    const req = new Request(`http://localhost/api/sessions/${sessionId}/retry`, {
      method: 'POST',
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBe(sessionId);
    expect(body.message).toContain('Retry started');

    // Should have emitted session.uploaded to trigger the orchestrator
    expect(emittedEvents).toContain('session.uploaded');
  });

  it('resets the job to validate stage on retry', async () => {
    const job = await jobQueue.create(sessionId);
    await jobQueue.start(job.id);
    await jobQueue.advance(job.id, PipelineStage.Detect);
    await jobQueue.fail(job.id, 'Failed at detect stage');

    const req = new Request(`http://localhost/api/sessions/${sessionId}/retry`, {
      method: 'POST',
    });
    await app.fetch(req);

    const updated = await jobQueue.findBySessionId(sessionId);
    expect(updated?.currentStage).toBe(PipelineStage.Validate);
    expect(updated?.status).toBe('pending');
  });
});
