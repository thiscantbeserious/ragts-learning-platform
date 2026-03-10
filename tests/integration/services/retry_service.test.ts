// @vitest-environment node
/**
 * Unit tests for RetryService.
 * Tests state validation, job state machine transitions, and event emission.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteDatabaseImpl } from '../../../src/server/db/sqlite/sqlite_database_impl.js';
import type { DatabaseContext } from '../../../src/server/db/database_adapter.js';
import { EmitterEventBusImpl } from '../../../src/server/events/emitter_event_bus_impl.js';
import { PipelineStage } from '../../../src/shared/types/pipeline.js';
import { RetryService } from '../../../src/server/services/retry_service.js';

describe('RetryService.retry', () => {
  let testDir: string;
  let ctx: DatabaseContext;
  let eventBus: EmitterEventBusImpl;
  let service: RetryService;
  let sessionId: string;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'ragts-retrysvc-'));
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: testDir });
    eventBus = new EmitterEventBusImpl();

    service = new RetryService({
      sessionRepository: ctx.sessionRepository,
      jobQueue: ctx.jobQueue,
      eventBus,
    });

    const session = await ctx.sessionRepository.createWithId('test-session', {
      filename: 'test.cast',
      filepath: '/tmp/test.cast',
      size_bytes: 100,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });
    sessionId = session.id;
  });

  afterEach(async () => {
    await ctx.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns 404 for non-existent session', async () => {
    const result = await service.retry('nonexistent-id');
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.status).toBe(404);
    expect(result.error).toContain('not found');
  });

  it('returns 400 when no job exists for session', async () => {
    const result = await service.retry(sessionId);
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.status).toBe(400);
    expect(result.error).toContain('nothing to retry');
  });

  it('returns 409 when job is in running state', async () => {
    const job = await ctx.jobQueue.create(sessionId);
    await ctx.jobQueue.start(job.id);

    const result = await service.retry(sessionId);
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.status).toBe(409);
    expect(result.error).toContain('already processing');
  });

  it('returns 400 when job is in pending state', async () => {
    await ctx.jobQueue.create(sessionId);

    const result = await service.retry(sessionId);
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.status).toBe(400);
    expect(result.error).toContain('pending');
  });

  it('returns 400 when job is in completed state', async () => {
    const job = await ctx.jobQueue.create(sessionId);
    await ctx.jobQueue.start(job.id);
    await ctx.jobQueue.complete(job.id);

    const result = await service.retry(sessionId);
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.status).toBe(400);
    expect(result.error).toContain('completed');
  });

  it('retries a failed job and resets it to validate stage', async () => {
    const job = await ctx.jobQueue.create(sessionId);
    await ctx.jobQueue.start(job.id);
    await ctx.jobQueue.fail(job.id, 'Test failure');

    const result = await service.retry(sessionId);
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.data.sessionId).toBe(sessionId);
    expect(result.data.message).toContain('Retry started');

    const updatedJob = await ctx.jobQueue.findBySessionId(sessionId);
    expect(updatedJob?.status).toBe('pending');
    expect(updatedJob?.currentStage).toBe(PipelineStage.Validate);
  });

  it('emits session.uploaded event when retry succeeds', async () => {
    const job = await ctx.jobQueue.create(sessionId);
    await ctx.jobQueue.start(job.id);
    await ctx.jobQueue.fail(job.id, 'Pipeline error');

    const emitted: string[] = [];
    eventBus.on('session.uploaded', (e) => emitted.push(e.type));

    await service.retry(sessionId);
    expect(emitted).toContain('session.uploaded');
  });

  it('retries a job that failed at detect stage, resetting to validate', async () => {
    const job = await ctx.jobQueue.create(sessionId);
    await ctx.jobQueue.start(job.id);
    await ctx.jobQueue.advance(job.id, PipelineStage.Detect);
    await ctx.jobQueue.fail(job.id, 'Detection failed');

    await service.retry(sessionId);

    const updatedJob = await ctx.jobQueue.findBySessionId(sessionId);
    expect(updatedJob?.currentStage).toBe(PipelineStage.Validate);
    expect(updatedJob?.status).toBe('pending');
  });

  it('result includes jobId', async () => {
    const job = await ctx.jobQueue.create(sessionId);
    await ctx.jobQueue.start(job.id);
    await ctx.jobQueue.fail(job.id, 'Failed');

    const result = await service.retry(sessionId);
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.data.jobId).toBeDefined();
    expect(typeof result.data.jobId).toBe('string');
  });
});
