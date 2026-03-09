// @vitest-environment node
/**
 * Tests for GET /api/sessions/:id/status endpoint.
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
import { PipelineStage } from '../../shared/pipeline_events.js';
import { handleGetStatus } from './status.js';

describe('GET /api/sessions/:id/status', () => {
  let testDir: string;
  let app: Hono;
  let ctx: DatabaseContext;
  let sessionRepository: SessionAdapter;
  let jobQueue: JobQueueAdapter;
  let sessionId: string;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'ragts-status-test-'));
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

    app = new Hono();
    app.get('/api/sessions/:id/status', (c) =>
      handleGetStatus(c, sessionRepository, jobQueue)
    );
  });

  afterEach(async () => {
    await ctx.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns 404 for non-existent session', async () => {
    const req = new Request('http://localhost/api/sessions/nonexistent/status');
    const res = await app.fetch(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('not found');
  });

  it('returns completed status when no job exists (pre-upgrade session)', async () => {
    const req = new Request(`http://localhost/api/sessions/${sessionId}/status`);
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBe(sessionId);
    expect(body.status).toBe('completed');
    expect(body.currentStage).toBeNull();
  });

  it('returns pending status for queued job', async () => {
    await jobQueue.create(sessionId);

    const req = new Request(`http://localhost/api/sessions/${sessionId}/status`);
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBe(sessionId);
    expect(body.status).toBe('pending');
    expect(body.currentStage).toBe(PipelineStage.Validate);
    expect(typeof body.attempts).toBe('number');
    expect(typeof body.maxAttempts).toBe('number');
  });

  it('returns failed status with lastError for failed job', async () => {
    const job = await jobQueue.create(sessionId);
    await jobQueue.start(job.id);
    await jobQueue.fail(job.id, 'Something exploded');

    const req = new Request(`http://localhost/api/sessions/${sessionId}/status`);
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('failed');
    expect(body.lastError).toBe('Something exploded');
  });

  it('returns completed status for completed job', async () => {
    const job = await jobQueue.create(sessionId);
    await jobQueue.start(job.id);
    await jobQueue.complete(job.id);

    const req = new Request(`http://localhost/api/sessions/${sessionId}/status`);
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('completed');
    expect(body.completedAt).toBeDefined();
  });

  it('includes all expected response fields', async () => {
    const job = await jobQueue.create(sessionId);
    await jobQueue.start(job.id);

    const req = new Request(`http://localhost/api/sessions/${sessionId}/status`);
    const res = await app.fetch(req);
    const body = await res.json();
    expect(body).toHaveProperty('sessionId');
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('currentStage');
    expect(body).toHaveProperty('attempts');
    expect(body).toHaveProperty('maxAttempts');
    expect(body).toHaveProperty('lastError');
    expect(body).toHaveProperty('startedAt');
    expect(body).toHaveProperty('completedAt');
  });
});
