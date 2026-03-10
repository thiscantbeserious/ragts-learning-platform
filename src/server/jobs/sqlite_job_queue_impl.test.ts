// @vitest-environment node
/**
 * Tests for SqliteJobQueue: create, advance, fail, retry, recovery.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteDatabaseImpl } from '../db/sqlite/sqlite_database_impl.js';
import type { DatabaseContext } from '../db/database_adapter.js';
import type { JobQueueAdapter } from './job_queue_adapter.js';
import { PipelineStage } from '../../shared/types/pipeline.js';
import { createTestSession } from '../db/sqlite/test_fixtures.js';

describe('SqliteJobQueueImpl', () => {
  let ctx: DatabaseContext;
  let queue: JobQueueAdapter;
  let sessionId: string;

  beforeEach(async () => {
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: '/tmp', dbPath: ':memory:' });
    queue = ctx.jobQueue;

    // Create a test session to use as FK target
    const session = await ctx.sessionRepository.create(
      createTestSession({ filename: 'job-test.cast', filepath: 'sessions/job-test.cast' })
    );
    sessionId = session.id;
  });

  afterEach(async () => {
    await ctx.close();
  });

  describe('create', () => {
    it('creates a job with pending status and validate stage', async () => {
      const job = await queue.create(sessionId);

      expect(job.sessionId).toBe(sessionId);
      expect(job.status).toBe('pending');
      expect(job.currentStage).toBe(PipelineStage.Validate);
      expect(job.attempts).toBe(0);
      expect(job.maxAttempts).toBe(3);
      expect(job.lastError).toBeNull();
      expect(job.startedAt).toBeNull();
      expect(job.completedAt).toBeNull();
    });

    it('generates a unique id', async () => {
      const session2 = await ctx.sessionRepository.create(
        createTestSession({ filename: 'job2.cast', filepath: 'sessions/job2.cast' })
      );
      const job1 = await queue.create(sessionId);
      const job2 = await queue.create(session2.id);

      expect(job1.id).not.toBe(job2.id);
    });

    it('throws when creating a duplicate job for the same session', async () => {
      await queue.create(sessionId);
      await expect(queue.create(sessionId)).rejects.toThrow();
    });
  });

  describe('findBySessionId', () => {
    it('returns null when no job exists', async () => {
      const result = await queue.findBySessionId('nonexistent');
      expect(result).toBeNull();
    });

    it('returns the job when it exists', async () => {
      const created = await queue.create(sessionId);
      const found = await queue.findBySessionId(sessionId);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.sessionId).toBe(sessionId);
    });
  });

  describe('start', () => {
    it('marks job as running and records started_at', async () => {
      const job = await queue.create(sessionId);
      await queue.start(job.id);

      const updated = await queue.findBySessionId(sessionId);
      expect(updated!.status).toBe('running');
      expect(updated!.startedAt).not.toBeNull();
      expect(updated!.attempts).toBe(1);
    });

    it('throws when job is not in pending state', async () => {
      const job = await queue.create(sessionId);
      await queue.start(job.id); // now running
      await expect(queue.start(job.id)).rejects.toThrow(/cannot be started/);
    });
  });

  describe('advance', () => {
    it('sets the current stage on the job', async () => {
      const job = await queue.create(sessionId);
      await queue.advance(job.id, PipelineStage.Detect);

      const updated = await queue.findBySessionId(sessionId);
      expect(updated!.currentStage).toBe(PipelineStage.Detect);
    });

    it('advances through all stages in sequence', async () => {
      const job = await queue.create(sessionId);
      const stages: PipelineStage[] = [
        PipelineStage.Detect,
        PipelineStage.Replay,
        PipelineStage.Dedup,
        PipelineStage.Store,
      ];

      for (const stage of stages) {
        await queue.advance(job.id, stage);
        const updated = await queue.findBySessionId(sessionId);
        expect(updated!.currentStage).toBe(stage);
      }
    });
  });

  describe('complete', () => {
    it('marks job as completed and records completed_at', async () => {
      const job = await queue.create(sessionId);
      await queue.start(job.id);
      await queue.complete(job.id);

      const updated = await queue.findBySessionId(sessionId);
      expect(updated!.status).toBe('completed');
      expect(updated!.completedAt).not.toBeNull();
    });
  });

  describe('fail', () => {
    it('marks job as failed with error message', async () => {
      const job = await queue.create(sessionId);
      await queue.start(job.id);
      await queue.fail(job.id, 'Something went wrong');

      const updated = await queue.findBySessionId(sessionId);
      expect(updated!.status).toBe('failed');
      expect(updated!.lastError).toBe('Something went wrong');
    });
  });

  describe('retry', () => {
    it('resets failed job to pending at the given stage', async () => {
      const job = await queue.create(sessionId);
      await queue.start(job.id);
      await queue.fail(job.id, 'error');

      await queue.retry(job.id, PipelineStage.Detect);

      const updated = await queue.findBySessionId(sessionId);
      expect(updated!.status).toBe('pending');
      expect(updated!.currentStage).toBe(PipelineStage.Detect);
    });

    it('clears started_at and last_error on retry', async () => {
      const job = await queue.create(sessionId);
      await queue.start(job.id);
      await queue.fail(job.id, 'error');
      await queue.retry(job.id, PipelineStage.Detect);

      const updated = await queue.findBySessionId(sessionId);
      expect(updated!.startedAt).toBeNull();
      expect(updated!.lastError).toBeNull();
    });

    it('preserves attempt count on retry (only start() increments)', async () => {
      const job = await queue.create(sessionId);
      await queue.start(job.id); // attempts: 1
      await queue.fail(job.id, 'err');
      await queue.retry(job.id, PipelineStage.Validate); // state reset — attempts stays at 1

      const updated = await queue.findBySessionId(sessionId);
      // retry is a state reset; start() is the only counter increment
      expect(updated!.attempts).toBe(1);
    });
  });

  describe('findPending', () => {
    it('returns empty array when no pending jobs', async () => {
      const result = await queue.findPending();
      expect(result).toEqual([]);
    });

    it('returns jobs with pending status', async () => {
      await queue.create(sessionId);
      const result = await queue.findPending();
      expect(result).toHaveLength(1);
      expect(result[0]!.sessionId).toBe(sessionId);
    });

    it('does not return completed or failed jobs', async () => {
      const session2 = await ctx.sessionRepository.create(
        createTestSession({ filename: 'j2.cast', filepath: 'sessions/j2.cast' })
      );
      const session3 = await ctx.sessionRepository.create(
        createTestSession({ filename: 'j3.cast', filepath: 'sessions/j3.cast' })
      );

      const job1 = await queue.create(sessionId);
      const job2 = await queue.create(session2.id);
      await queue.create(session3.id); // stays pending

      await queue.start(job1.id);
      await queue.complete(job1.id);

      await queue.start(job2.id);
      await queue.fail(job2.id, 'error');

      const pending = await queue.findPending();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.sessionId).toBe(session3.id);
    });
  });

  describe('recoverInterrupted', () => {
    it('returns 0 when no running jobs', async () => {
      const count = await queue.recoverInterrupted();
      expect(count).toBe(0);
    });

    it('re-queues running jobs as pending with interrupted error preserved', async () => {
      const job = await queue.create(sessionId);
      await queue.start(job.id);

      const count = await queue.recoverInterrupted();
      expect(count).toBe(1);

      const updated = await queue.findBySessionId(sessionId);
      expect(updated!.status).toBe('pending');
      expect(updated!.currentStage).toBe('validate');
      expect(updated!.lastError).toContain('interrupted');
    });

    it('does not affect pending or completed jobs', async () => {
      const session2 = await ctx.sessionRepository.create(
        createTestSession({ filename: 'rec2.cast', filepath: 'sessions/rec2.cast' })
      );
      const session3 = await ctx.sessionRepository.create(
        createTestSession({ filename: 'rec3.cast', filepath: 'sessions/rec3.cast' })
      );

      await queue.create(sessionId); // pending — untouched
      const job2 = await queue.create(session2.id);
      await queue.start(job2.id);
      await queue.complete(job2.id); // completed — untouched
      const job3 = await queue.create(session3.id);
      await queue.start(job3.id); // running — should be recovered

      const count = await queue.recoverInterrupted();
      expect(count).toBe(1);

      const pendingJob = await queue.findBySessionId(sessionId);
      expect(pendingJob!.status).toBe('pending');

      const completedJob = await queue.findBySessionId(session2.id);
      expect(completedJob!.status).toBe('completed');
    });
  });
});
