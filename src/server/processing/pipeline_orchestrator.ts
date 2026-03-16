/**
 * PipelineOrchestrator: listens to EventBus, advances jobs through pipeline stages.
 *
 * Listens for `session.uploaded` and runs all pipeline stages in sequence.
 * Stages 1-4 (validate/detect/replay/dedup) run in a WorkerPool to keep the
 * main event loop free during WASM processing. Stage 5 (store) runs on the
 * main thread since it requires DB access.
 * Emits domain events after each stage completes for observability and SSE streaming.
 *
 * Connections: EventBus (events/), JobQueueAdapter (jobs/), WorkerPool (workers/).
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EventBusAdapter, EventHandler } from '../events/event_bus_adapter.js';
import type { JobQueueAdapter } from '../jobs/job_queue_adapter.js';
import type { SessionAdapter } from '../db/session_adapter.js';
import { PipelineStage, type PipelineEvent, type DetectionStatus } from '../../shared/types/pipeline.js';
import { store } from './stages/store.js';
import { logger } from '../logger.js';
import { WorkerPool } from '../workers/worker_pool.js';
import { resolveWorkerScript, type BuiltWorker } from '../workers/build_worker.js';
import type { PipelinePayload } from '../workers/pipeline_worker.js';
import type { ProcessedSession } from './types.js';

const log = logger.child({ module: 'orchestrator' });

/** Number of worker slots in the pipeline worker pool. */
const POOL_SIZE = 3;

/** Maps each pipeline stage to the intermediate detection_status value. */
const STAGE_STATUS: Record<PipelineStage, DetectionStatus> = {
  [PipelineStage.Validate]: 'validating',
  [PipelineStage.Detect]: 'detecting',
  [PipelineStage.Replay]: 'replaying',
  [PipelineStage.Dedup]: 'deduplicating',
  [PipelineStage.Store]: 'storing',
};

/** External dependencies injected into the orchestrator. */
export interface StageDependencies {
  sessionRepository: SessionAdapter;
}

/**
 * Pipeline orchestrator — event-driven job runner.
 * Call start() once at server startup (builds worker, starts pool), stop() at shutdown.
 */
export class PipelineOrchestrator {
  private readonly eventBus: EventBusAdapter;
  private readonly jobQueue: JobQueueAdapter;
  private readonly deps: StageDependencies;
  private readonly inflight = new Set<Promise<void>>();
  private pool: WorkerPool<PipelinePayload, ProcessedSession> | null = null;
  private builtWorker: BuiltWorker | null = null;

  private readonly onUploaded: (event: PipelineEvent) => void;

  constructor(eventBus: EventBusAdapter, jobQueue: JobQueueAdapter, deps: StageDependencies) {
    this.eventBus = eventBus;
    this.jobQueue = jobQueue;
    this.deps = deps;

    this.onUploaded = (event) => {
      if (event.type === 'session.uploaded') {
        void this.handleJobStart(event.sessionId);
      }
    };
  }

  /**
   * Build the worker script, start the worker pool, subscribe to events,
   * and recover any interrupted jobs.
   * Must be awaited before the server handles requests.
   */
  async start(): Promise<void> {
    // In source: this file is at src/server/processing/, worker is at src/server/workers/
    // In production (Vite bundle): start.js is at dist/server/, worker is at dist/server/workers/
    // Try both relative paths to find the worker entry.
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(thisDir, '../workers/pipeline_worker.ts'),   // source layout
      join(thisDir, 'workers/pipeline_worker.ts'),      // bundled layout (dist/server/)
    ];
    const workerEntry = candidates.find(p =>
      existsSync(p) || existsSync(p.replace(/\.ts$/, '.js'))
    );
    if (!workerEntry) {
      throw new Error(`Pipeline worker not found. Tried: ${candidates.join(', ')}`);
    }
    this.builtWorker = await resolveWorkerScript(workerEntry);

    this.pool = new WorkerPool<PipelinePayload, ProcessedSession>({
      workerPath: this.builtWorker.path,
      size: POOL_SIZE,
    });
    await this.pool.start();

    this.eventBus.on('session.uploaded', this.onUploaded as EventHandler<'session.uploaded'>);
    await this.recoverInterrupted();
  }

  /** Unsubscribe from events, shut down the pool, and clean up built worker. */
  async stop(): Promise<void> {
    this.eventBus.off('session.uploaded', this.onUploaded as EventHandler<'session.uploaded'>);
    await this.waitForPending();
    if (this.pool) {
      await this.pool.shutdown();
      this.pool = null;
    }
    if (this.builtWorker) {
      this.builtWorker.cleanup();
      this.builtWorker = null;
    }
  }

  /** Wait for all currently in-flight jobs to complete. Useful in tests. */
  async waitForPending(): Promise<void> {
    await Promise.allSettled(this.inflight);
  }

  /** Returns a snapshot of current worker pool state. */
  getPoolStats() {
    return this.pool?.stats() ?? null;
  }

  /** Recover interrupted jobs on boot by resetting them to pending for re-processing. */
  private async recoverInterrupted(): Promise<void> {
    const count = await this.jobQueue.recoverInterrupted();
    if (count > 0) {
      log.info({ count }, 'Recovered interrupted jobs — re-queueing as pending');
    }
    const pending = await this.jobQueue.findPending();
    for (const job of pending) {
      void this.handleJobStart(job.sessionId);
    }
  }

  /** Enqueue a new job and track it in the inflight set. */
  private handleJobStart(sessionId: string): Promise<void> {
    const p = this.runJob(sessionId).finally(() => {
      this.inflight.delete(p);
    });
    this.inflight.add(p);
    return p;
  }

  /** Run all pipeline stages for a session, emitting events and updating status between each. */
  private async runJob(sessionId: string): Promise<void> {
    const job = await this.jobQueue.findBySessionId(sessionId);
    if (!job) {
      log.warn({ sessionId }, 'No job found — ignoring session.uploaded event');
      return;
    }

    try {
      try {
        await this.jobQueue.start(job.id);
      } catch (err) {
        // Job was already claimed by another runner — not an error
        if (err instanceof Error && err.message.includes('not in pending state')) {
          log.info({ sessionId }, 'Job already claimed — skipping duplicate');
          return;
        }
        throw err;
      }

      const session = await this.deps.sessionRepository.findById(sessionId);
      if (!session) throw new Error(`Session not found: ${sessionId}`);

      // Emit stage-advancing events as the worker advances through stages
      await this.advanceStage(job.id, sessionId, PipelineStage.Validate);

      // Stages 1-4 run in the worker thread (validate → detect → replay → dedup)
      const result = await this.pool!.execute({ filePath: session.filepath, sessionId });

      // Emit batched stage events now that the worker has completed all four stages
      this.eventBus.emit({ type: 'session.validated', sessionId, eventCount: result.eventCount });
      await this.advanceStage(job.id, sessionId, PipelineStage.Detect);
      this.eventBus.emit({ type: 'session.detected', sessionId, sectionCount: result.detectedSectionsCount });
      await this.advanceStage(job.id, sessionId, PipelineStage.Replay);
      this.eventBus.emit({ type: 'session.replayed', sessionId, lineCount: 0 });
      await this.advanceStage(job.id, sessionId, PipelineStage.Dedup);
      this.eventBus.emit({ type: 'session.deduped', sessionId, rawLines: 0, cleanLines: 0 });

      // Stage 5 runs on main thread (needs DB)
      await this.advanceStage(job.id, sessionId, PipelineStage.Store);
      await store(result, this.deps.sessionRepository);
      await this.jobQueue.complete(job.id);

      this.eventBus.emit({ type: 'session.ready', sessionId });
      log.info({ sessionId }, 'Pipeline completed successfully');
    } catch (error) {
      await this.handleStageError(job.id, sessionId, error);
    }
  }

  /** Advance job to the next stage and update the session's detection_status. */
  private async advanceStage(jobId: string, sessionId: string, stage: PipelineStage): Promise<void> {
    await this.jobQueue.advance(jobId, stage);
    await this.deps.sessionRepository.updateDetectionStatus(sessionId, STAGE_STATUS[stage]);
  }

  /** Mark the job as failed, update session status, and emit session.failed. */
  private async handleStageError(jobId: string, sessionId: string, error: unknown): Promise<void> {
    const rawMessage = error instanceof Error ? error.message : String(error);
    log.error({ sessionId, err: error }, 'Pipeline stage failed');

    try {
      const job = await this.jobQueue.findBySessionId(sessionId);
      const stage = job?.currentStage ?? PipelineStage.Validate;
      await this.jobQueue.fail(jobId, rawMessage);
      await this.deps.sessionRepository.updateDetectionStatus(sessionId, 'failed');
      this.eventBus.emit({ type: 'session.failed', sessionId, stage, error: sanitizeErrorMessage(error) });
    } catch (innerErr) {
      log.error({ sessionId, err: innerErr }, 'Failed to record stage error');
    }
  }
}

/** Produce a client-safe error message, stripping file paths and stack traces. */
function sanitizeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Processing failed';
  const msg = error.message;
  const cleaned = msg.replaceAll(/\/[\w/.\\-]+/g, '<path>');
  return cleaned.slice(0, 200);
}
