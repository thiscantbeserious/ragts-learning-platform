/**
 * Generic worker thread pool with FIFO queuing, crash recovery, and graceful shutdown.
 * Manages N pre-warmed workers. Transparent to the caller — just execute(payload) → result.
 */

import { Worker } from 'node:worker_threads';
import os from 'node:os';

// ── Public types ─────────────────────────────────────────────────────────────

export interface WorkerPoolOptions {
  /** Path to the worker script. */
  workerPath: string;
  /** Number of worker slots to create. Defaults to CPU count. */
  size?: number;
  /** Optional data passed to every worker at spawn time via workerData. */
  workerData?: unknown;
  /** Max ms to wait for a worker to send 'ready'. Default: 30000. */
  initTimeoutMs?: number;
  /** Max ms to wait for in-flight jobs during shutdown. Default: 30000. */
  shutdownTimeoutMs?: number;
  /** Max consecutive crashes before a slot is permanently marked dead. Default: 3. */
  maxCrashesPerSlot?: number;
}

export interface PoolStats {
  /** Total worker slots (including dead). */
  total: number;
  /** Workers currently processing a job. */
  busy: number;
  /** Workers ready for work. */
  idle: number;
  /** Jobs waiting in the queue. */
  queued: number;
  /** Slots that exceeded the crash limit. */
  dead: number;
}

// ── Internal types ───────────────────────────────────────────────────────────

interface PendingJob<TPayload, TResult> {
  id: number;
  payload: TPayload;
  resolve: (value: TResult) => void;
  reject: (reason: unknown) => void;
}

type SlotState = 'idle' | 'busy' | 'dead';

interface WorkerSlot<TPayload, TResult> {
  worker: Worker | null;
  state: SlotState;
  crashCount: number;
  currentJob: PendingJob<TPayload, TResult> | null;
}

type WorkerMessage =
  | { type: 'ready' }
  | { type: 'result'; id: number; ok: true; result: unknown }
  | { type: 'result'; id: number; ok: false; error: string };

// ── WorkerPool ────────────────────────────────────────────────────────────────

export class WorkerPool<TPayload, TResult> {
  private readonly workerPath: string;
  private readonly size: number;
  private readonly workerData: unknown;
  private readonly initTimeoutMs: number;
  private readonly shutdownTimeoutMs: number;
  private readonly maxCrashesPerSlot: number;

  private slots: WorkerSlot<TPayload, TResult>[] = [];
  private readonly queue: PendingJob<TPayload, TResult>[] = [];
  private nextJobId = 0;
  private shuttingDown = false;

  constructor(options: WorkerPoolOptions) {
    this.workerPath = options.workerPath;
    this.size = options.size ?? os.cpus().length;
    this.workerData = options.workerData;
    this.initTimeoutMs = options.initTimeoutMs ?? 30000;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? 30000;
    this.maxCrashesPerSlot = options.maxCrashesPerSlot ?? 3;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Spawns all worker slots and waits for each to send 'ready'.
   * Rejects if any worker fails to become ready within initTimeoutMs.
   */
  async start(): Promise<void> {
    this.slots = Array.from({ length: this.size }, () => ({
      worker: null,
      state: 'idle' as SlotState,
      crashCount: 0,
      currentJob: null,
    }));

    await Promise.all(this.slots.map((slot) => this.spawnWorker(slot)));
  }

  /**
   * Sends a job to an idle worker, or queues it if all workers are busy.
   * Returns the worker's result (or throws on worker error).
   */
  execute(payload: TPayload): Promise<TResult> {
    return new Promise<TResult>((resolve, reject) => {
      if (this.shuttingDown) {
        reject(new Error('WorkerPool is shutting down'));
        return;
      }

      const job: PendingJob<TPayload, TResult> = {
        id: this.nextJobId++,
        payload,
        resolve,
        reject,
      };

      const idle = this.slots.find((s) => s.state === 'idle');
      if (idle) {
        this.dispatchJob(idle, job);
      } else {
        this.queue.push(job);
      }
    });
  }

  /**
   * Drains the queue (rejects pending jobs), waits for in-flight jobs to finish,
   * then terminates all workers.
   */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;

    // Reject all queued (not yet started) jobs
    for (const job of this.queue.splice(0)) {
      job.reject(new Error('WorkerPool shutdown'));
    }

    // Wait for in-flight jobs to complete (or timeout)
    const inFlightPromises = this.slots
      .filter((s) => s.state === 'busy' && s.currentJob !== null)
      .map(
        (s) =>
          new Promise<void>((resolve) => {
            const originalResolve = s.currentJob!.resolve;
            const originalReject = s.currentJob!.reject;
            s.currentJob!.resolve = (v) => {
              originalResolve(v);
              resolve();
            };
            s.currentJob!.reject = (e) => {
              originalReject(e);
              resolve();
            };
          }),
      );

    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Shutdown timeout')), this.shutdownTimeoutMs),
    );

    await Promise.race([Promise.all(inFlightPromises), timeout]).catch(() => void 0);

    // Terminate all workers
    await Promise.all(
      this.slots.map(async (slot) => {
        if (slot.worker) {
          await slot.worker.terminate();
          slot.worker = null;
          if (slot.state !== 'dead') slot.state = 'idle';
        }
      }),
    );

    // After termination clear idle slots so stats show nothing active
    for (const slot of this.slots) {
      if (slot.state === 'idle') slot.state = 'idle'; // no-op but explicit
    }
  }

  /** Returns a snapshot of current pool state. */
  stats(): PoolStats {
    const total = this.slots.length;
    const dead = this.slots.filter((s) => s.state === 'dead').length;
    const busy = this.slots.filter((s) => s.state === 'busy').length;
    const idle = this.slots.filter((s) => s.state === 'idle' && s.worker !== null).length;
    const queued = this.queue.length;

    return { total, busy, idle, queued, dead };
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  /** Spawns a worker for the given slot and waits for the 'ready' message. */
  private spawnWorker(slot: WorkerSlot<TPayload, TResult>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const worker = new Worker(this.workerPath, {
        workerData: this.workerData,
      });

      slot.worker = worker;

      const timer = setTimeout(() => {
        worker.terminate();
        slot.worker = null;
        reject(new Error(`Worker did not become ready within ${this.initTimeoutMs}ms`));
      }, this.initTimeoutMs);

      const onMessage = (msg: WorkerMessage) => {
        if (msg.type === 'ready') {
          clearTimeout(timer);
          worker.off('message', onMessage);
          worker.on('message', (m: WorkerMessage) => this.handleWorkerMessage(slot, m));
          worker.on('error', (err: Error) => this.handleWorkerError(slot, err));
          worker.on('exit', (code) => this.handleWorkerExit(slot, code));
          slot.state = 'idle';
          resolve();
        }
      };

      worker.on('message', onMessage);
      worker.on('error', (err) => {
        clearTimeout(timer);
        slot.worker = null;
        reject(err);
      });
      worker.on('exit', (code) => {
        if (code !== 0) {
          clearTimeout(timer);
          slot.worker = null;
          reject(new Error(`Worker exited with code ${code} before becoming ready`));
        }
      });
    });
  }

  /** Sends a job message to the given slot's worker and marks it busy. */
  private dispatchJob(slot: WorkerSlot<TPayload, TResult>, job: PendingJob<TPayload, TResult>): void {
    slot.state = 'busy';
    slot.currentJob = job;
    slot.worker!.postMessage({ type: 'job', id: job.id, payload: job.payload });
  }

  /** Handles a result message received from a worker. */
  private handleWorkerMessage(slot: WorkerSlot<TPayload, TResult>, msg: WorkerMessage): void {
    if (msg.type !== 'result') return;

    if (slot.currentJob?.id !== msg.id) return;

    const job = slot.currentJob;
    slot.currentJob = null;
    slot.state = 'idle';

    if (msg.ok) {
      job.resolve(msg.result as TResult);
    } else {
      job.reject(new Error(msg.error));
    }

    this.drainQueue(slot);
  }

  /** Handles an error event from a worker (also triggers crash handling). */
  private handleWorkerError(slot: WorkerSlot<TPayload, TResult>, _err: Error): void {
    this.handleCrash(slot);
  }

  /** Handles a non-zero exit from a worker (crash). */
  private handleWorkerExit(slot: WorkerSlot<TPayload, TResult>, code: number): void {
    if (code === 0 || this.shuttingDown) return;
    this.handleCrash(slot);
  }

  /**
   * Handles a crashed worker slot: rejects in-flight job, increments crash count,
   * respawns if under the limit, marks dead otherwise.
   */
  private handleCrash(slot: WorkerSlot<TPayload, TResult>): void {
    const job = slot.currentJob;
    slot.currentJob = null;
    slot.worker = null;

    if (job) {
      job.reject(new Error('Worker crashed'));
    }

    slot.crashCount++;

    if (slot.crashCount >= this.maxCrashesPerSlot) {
      slot.state = 'dead';
      this.drainQueueToOtherSlots();
      return;
    }

    slot.state = 'idle';
    this.spawnWorker(slot)
      .then(() => this.drainQueue(slot))
      .catch(() => {
        slot.state = 'dead';
        this.drainQueueToOtherSlots();
      });
  }

  /** Dispatches the next queued job to a specific idle slot. */
  private drainQueue(slot: WorkerSlot<TPayload, TResult>): void {
    if (this.queue.length === 0 || slot.state !== 'idle') return;
    const next = this.queue.shift()!;
    this.dispatchJob(slot, next);
  }

  /** Dispatches queued jobs to any available idle slots after a slot dies. */
  private drainQueueToOtherSlots(): void {
    for (const slot of this.slots) {
      if (this.queue.length === 0) break;
      if (slot.state === 'idle') {
        this.drainQueue(slot);
      }
    }
  }
}
