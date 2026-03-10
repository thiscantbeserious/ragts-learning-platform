// @vitest-environment node
/**
 * Unit tests for StatusService.
 * Tests session existence check and job status mapping.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteDatabaseImpl } from '../../../src/server/db/sqlite/sqlite_database_impl.js';
import type { DatabaseContext } from '../../../src/server/db/database_adapter.js';
import { PipelineStage } from '../../../src/shared/types/pipeline.js';
import { StatusService } from '../../../src/server/services/status_service.js';

describe('StatusService.getStatus', () => {
  let testDir: string;
  let ctx: DatabaseContext;
  let service: StatusService;
  let sessionId: string;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'ragts-statussvc-'));
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: testDir });

    service = new StatusService({
      sessionRepository: ctx.sessionRepository,
      jobQueue: ctx.jobQueue,
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
    const result = await service.getStatus('nonexistent-id');
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.status).toBe(404);
    expect(result.error).toContain('not found');
  });

  it('returns synthetic completed record when no job exists (pre-upgrade session)', async () => {
    const result = await service.getStatus(sessionId);
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.data.sessionId).toBe(sessionId);
    expect(result.data.status).toBe('completed');
    expect(result.data.currentStage).toBeNull();
    expect(result.data.attempts).toBe(0);
    expect(result.data.maxAttempts).toBe(0);
    expect(result.data.lastError).toBeNull();
    expect(result.data.startedAt).toBeNull();
    expect(result.data.completedAt).toBeNull();
  });

  it('returns pending status for a queued job', async () => {
    await ctx.jobQueue.create(sessionId);

    const result = await service.getStatus(sessionId);
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.data.status).toBe('pending');
    expect(result.data.currentStage).toBe(PipelineStage.Validate);
    expect(typeof result.data.attempts).toBe('number');
    expect(typeof result.data.maxAttempts).toBe('number');
  });

  it('returns running status for a started job', async () => {
    const job = await ctx.jobQueue.create(sessionId);
    await ctx.jobQueue.start(job.id);

    const result = await service.getStatus(sessionId);
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.data.status).toBe('running');
    expect(result.data.startedAt).toBeDefined();
  });

  it('returns failed status with lastError for a failed job', async () => {
    const job = await ctx.jobQueue.create(sessionId);
    await ctx.jobQueue.start(job.id);
    await ctx.jobQueue.fail(job.id, 'Something exploded');

    const result = await service.getStatus(sessionId);
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.data.status).toBe('failed');
    expect(result.data.lastError).toBe('Something exploded');
  });

  it('returns completed status with completedAt for a completed job', async () => {
    const job = await ctx.jobQueue.create(sessionId);
    await ctx.jobQueue.start(job.id);
    await ctx.jobQueue.complete(job.id);

    const result = await service.getStatus(sessionId);
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.data.status).toBe('completed');
    expect(result.data.completedAt).toBeDefined();
  });

  it('response includes all expected fields', async () => {
    const job = await ctx.jobQueue.create(sessionId);
    await ctx.jobQueue.start(job.id);

    const result = await service.getStatus(sessionId);
    expect(result.ok).toBe(true);
    assert(result.ok);
    const data = result.data;
    expect(data).toHaveProperty('sessionId');
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('currentStage');
    expect(data).toHaveProperty('attempts');
    expect(data).toHaveProperty('maxAttempts');
    expect(data).toHaveProperty('lastError');
    expect(data).toHaveProperty('startedAt');
    expect(data).toHaveProperty('completedAt');
  });
});
