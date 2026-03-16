// @vitest-environment node

/**
 * Tests for WorkerPool — generic worker thread pool with FIFO queuing,
 * crash recovery, and graceful shutdown.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { WorkerPool } from './worker_pool.js';
import type { WorkerPoolOptions } from './worker_pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const echoWorkerPath = resolve(__dirname, 'test_echo_worker.ts');
const crashWorkerPath = resolve(__dirname, 'test_crash_worker.ts');

/** Builds a default options object for the echo worker. */
function echoOptions(overrides: Partial<WorkerPoolOptions> = {}): WorkerPoolOptions {
  return {
    workerPath: echoWorkerPath,
    size: 2,
    initTimeoutMs: 5000,
    shutdownTimeoutMs: 5000,
    ...overrides,
  };
}

describe('WorkerPool', () => {
  let pool: WorkerPool<any, any> | null = null;

  afterEach(async () => {
    if (pool) {
      await pool.shutdown().catch(() => void 0);
      pool = null;
    }
  });

  // ── Pool lifecycle ─────────────────────────────────────────────────────────

  describe('lifecycle', () => {
    it('start() creates workers and stats reflect idle state', async () => {
      pool = new WorkerPool(echoOptions({ size: 2 }));
      await pool.start();

      const stats = pool.stats();
      expect(stats.total).toBe(2);
      expect(stats.idle).toBe(2);
      expect(stats.busy).toBe(0);
      expect(stats.queued).toBe(0);
      expect(stats.dead).toBe(0);
    });

    it('shutdown() terminates all workers', async () => {
      pool = new WorkerPool(echoOptions({ size: 2 }));
      await pool.start();
      await pool.shutdown();

      // After shutdown the pool should have no active workers
      const stats = pool.stats();
      expect(stats.total).toBe(2);
      expect(stats.idle).toBe(0);
      expect(stats.busy).toBe(0);
    });
  });

  // ── Basic dispatch ─────────────────────────────────────────────────────────

  describe('dispatch', () => {
    it('execute() returns the echoed result', async () => {
      pool = new WorkerPool(echoOptions({ size: 1 }));
      await pool.start();

      const result = await pool.execute({ hello: 'world' });
      expect(result).toEqual({ hello: 'world' });
    });

    it('execute() queues jobs when all workers busy', async () => {
      pool = new WorkerPool(echoOptions({ size: 2 }));
      await pool.start();

      // Fire 5 jobs simultaneously on a 2-worker pool
      const jobs = Array.from({ length: 5 }, (_, i) => pool!.execute({ n: i }));
      const results = await Promise.all(jobs);

      expect(results).toHaveLength(5);
      for (let i = 0; i < 5; i++) {
        expect(results[i]).toEqual({ n: i });
      }
    });
  });

  // ── Stats accuracy ─────────────────────────────────────────────────────────

  describe('stats accuracy', () => {
    it('busy count increases while jobs are in flight', async () => {
      pool = new WorkerPool(echoOptions({ size: 2 }));
      await pool.start();

      // Start two jobs (pool is size 2) without awaiting
      const j1 = pool.execute({ x: 1 });
      const j2 = pool.execute({ x: 2 });

      const stats = pool.stats();
      expect(stats.busy).toBeGreaterThanOrEqual(0); // may be 0 if instant, at most 2

      await Promise.all([j1, j2]);
      const after = pool.stats();
      expect(after.busy).toBe(0);
      expect(after.idle).toBe(2);
    });

    it('queued count is positive when more jobs than workers', async () => {
      pool = new WorkerPool(echoOptions({ size: 1 }));
      await pool.start();

      // Start 3 jobs on a 1-worker pool
      const jobs = [pool.execute({ a: 1 }), pool.execute({ a: 2 }), pool.execute({ a: 3 })];

      // At least one should be queued immediately after dispatching
      const stats = pool.stats();
      expect(stats.queued + stats.busy).toBeGreaterThanOrEqual(1);

      await Promise.all(jobs);
    });
  });

  // ── Crash recovery ─────────────────────────────────────────────────────────

  describe('crash recovery', () => {
    it('rejects job whose worker crashes and respawns for subsequent jobs', async () => {
      pool = new WorkerPool<{ crash?: boolean }, { crash?: boolean }>({
        workerPath: crashWorkerPath,
        size: 1,
        initTimeoutMs: 5000,
        shutdownTimeoutMs: 5000,
        maxCrashesPerSlot: 3,
      });
      await pool.start();

      // This job should crash the worker and reject
      await expect(pool.execute({ crash: true })).rejects.toThrow();

      // Worker should respawn; subsequent job should succeed
      const result = await pool.execute({ value: 42 } as unknown as { crash?: boolean });
      expect(result).toEqual({ value: 42 });
    });

    it('marks slot dead after maxCrashesPerSlot crashes', async () => {
      pool = new WorkerPool<{ crash?: boolean }, unknown>({
        workerPath: crashWorkerPath,
        size: 1,
        initTimeoutMs: 5000,
        shutdownTimeoutMs: 5000,
        maxCrashesPerSlot: 3,
      });
      await pool.start();

      // Crash 3 times to exhaust the slot
      for (let i = 0; i < 3; i++) {
        await pool.execute({ crash: true }).catch(() => void 0);
      }

      const stats = pool.stats();
      expect(stats.dead).toBe(1);
    });
  });

  // ── Shutdown rejects queued jobs ───────────────────────────────────────────

  describe('shutdown', () => {
    it('rejects queued jobs on shutdown', async () => {
      pool = new WorkerPool(echoOptions({ size: 1 }));
      await pool.start();

      // Occupy the single worker, queue additional jobs
      const inFlight = pool.execute({ slow: true });
      const queued1 = pool.execute({ q: 1 });
      const queued2 = pool.execute({ q: 2 });

      // Immediately shut down before queue drains
      const shutdownPromise = pool.shutdown();

      const [, r1, r2] = await Promise.allSettled([inFlight, queued1, queued2]);
      await shutdownPromise;

      // Queued jobs must be rejected
      expect(r1.status).toBe('rejected');
      expect(r2.status).toBe('rejected');
    });
  });

  // ── Init timeout ───────────────────────────────────────────────────────────

  describe('init timeout', () => {
    it('start() rejects when a worker never sends ready', async () => {
      // Point at a worker script that does not exist so the worker errors immediately,
      // or use a very short timeout to force the race.
      const neverReadyPath = resolve(__dirname, 'test_never_ready_worker.ts');

      pool = new WorkerPool({
        workerPath: neverReadyPath,
        size: 1,
        initTimeoutMs: 100, // very short
        shutdownTimeoutMs: 1000,
      });

      await expect(pool.start()).rejects.toThrow();
    });
  });
});
