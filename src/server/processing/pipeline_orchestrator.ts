/**
 * PipelineOrchestrator: listens to EventBus, advances jobs through pipeline stages.
 *
 * Listens for `session.uploaded` and runs all pipeline stages in sequence.
 * Emits domain events between stages for observability and SSE streaming.
 *
 * Concurrency is bounded at MAX_CONCURRENT. When a slot frees, drainPending()
 * picks up the next waiting job automatically (Finding 2 fix).
 *
 * Connections: EventBus (events/), JobQueueAdapter (jobs/), stage functions (stages/).
 */

import type { EventBusAdapter, EventHandler } from '../events/event_bus_adapter.js';
import type { JobQueueAdapter } from '../jobs/job_queue_adapter.js';
import type { SessionAdapter } from '../db/session_adapter.js';
import type { StorageAdapter } from '../storage/storage_adapter.js';
import { PipelineStage, type PipelineEvent, type DetectionStatus } from '../../shared/pipeline_events.js';
import { validate } from './stages/validate.js';
import { detect } from './stages/detect.js';
import { replay } from './stages/replay.js';
import { dedup } from './stages/dedup.js';
import { store } from './stages/store.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'orchestrator' });

/** Maximum number of concurrently running pipeline jobs. */
const MAX_CONCURRENT = 3;

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
  storageAdapter: StorageAdapter;
}

/**
 * Pipeline orchestrator — event-driven job runner.
 * Call start() once at server startup (it initialises WASM), stop() at shutdown.
 */
export class PipelineOrchestrator {
  private readonly eventBus: EventBusAdapter;
  private readonly jobQueue: JobQueueAdapter;
  private readonly deps: StageDependencies;
  private activeCount = 0;
  private readonly inflight = new Set<Promise<void>>();

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
   * Subscribe to events, initialise WASM, and recover any interrupted jobs.
   * Must be awaited before the server handles requests.
   */
  async start(): Promise<void> {
    const { initVt } = await import('#vt-wasm');
    await initVt();
    this.eventBus.on('session.uploaded', this.onUploaded as EventHandler<'session.uploaded'>);
    await this.recoverInterrupted();
  }

  /** Unsubscribe from events and wait for in-flight jobs to finish. */
  async stop(): Promise<void> {
    this.eventBus.off('session.uploaded', this.onUploaded as EventHandler<'session.uploaded'>);
    await Promise.allSettled(this.inflight);
  }

  /** Wait for all currently in-flight jobs to complete. Useful in tests. */
  async waitForPending(): Promise<void> {
    await Promise.allSettled(this.inflight);
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

  /**
   * Slot-guarded job runner.
   * When MAX_CONCURRENT is reached the job stays pending; drainPending()
   * picks it up once a slot frees.
   */
  private handleJobStart(sessionId: string): Promise<void> {
    if (this.activeCount >= MAX_CONCURRENT) {
      log.warn({ sessionId }, 'Concurrency limit reached — job deferred');
      return Promise.resolve();
    }
    this.activeCount++;
    const p = this.runJob(sessionId).finally(() => {
      this.activeCount--;
      this.inflight.delete(p);
      void this.drainPending();
    });
    this.inflight.add(p);
    return p;
  }

  /** Pick up the next pending job after a slot becomes available. */
  private async drainPending(): Promise<void> {
    if (this.activeCount >= MAX_CONCURRENT) return;
    const pending = await this.jobQueue.findPending();
    if (pending.length > 0 && pending[0] !== undefined) {
      void this.handleJobStart(pending[0].sessionId);
    }
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
        throw err; // Re-throw real errors to be caught by the outer try/catch
      }

      const session = await this.deps.sessionRepository.findById(sessionId);
      if (!session) throw new Error(`Session not found: ${sessionId}`);

      // Stage 1: validate
      await this.advanceStage(job.id, sessionId, PipelineStage.Validate);
      const validateResult = await validate(session.filepath, sessionId);
      this.eventBus.emit({ type: 'session.validated', sessionId, eventCount: validateResult.eventCount });

      // Stage 2: detect
      await this.advanceStage(job.id, sessionId, PipelineStage.Detect);
      const detectResult = detect(validateResult.events, validateResult.markers);
      this.eventBus.emit({ type: 'session.detected', sessionId, sectionCount: detectResult.sectionCount });

      // Stage 3: replay
      await this.advanceStage(job.id, sessionId, PipelineStage.Replay);
      const replayResult = replay(validateResult.header, validateResult.events, detectResult.boundaries);
      this.eventBus.emit({ type: 'session.replayed', sessionId, lineCount: replayResult.rawSnapshot.lines.length });

      // Stage 4: dedup
      await this.advanceStage(job.id, sessionId, PipelineStage.Dedup);
      const processed = dedup(
        sessionId,
        replayResult.rawSnapshot,
        replayResult.sectionData,
        replayResult.epochBoundaries,
        detectResult.boundaries,
        validateResult.eventCount
      );
      const cleanLines = (JSON.parse(processed.snapshot) as { lines?: unknown[] }).lines?.length ?? 0;
      this.eventBus.emit({ type: 'session.deduped', sessionId, rawLines: replayResult.rawSnapshot.lines.length, cleanLines });

      // Stage 5: store
      await this.advanceStage(job.id, sessionId, PipelineStage.Store);
      await store(processed, this.deps.sessionRepository);
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
    const message = error instanceof Error ? error.message : String(error);
    log.error({ sessionId, err: error }, 'Pipeline stage failed');

    try {
      const job = await this.jobQueue.findBySessionId(sessionId);
      const stage = job?.currentStage ?? PipelineStage.Validate;
      await this.jobQueue.fail(jobId, message);
      await this.deps.sessionRepository.updateDetectionStatus(sessionId, 'failed');
      this.eventBus.emit({ type: 'session.failed', sessionId, stage, error: message });
    } catch (innerErr) {
      log.error({ sessionId, err: innerErr }, 'Failed to record stage error');
    }
  }
}
