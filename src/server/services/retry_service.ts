/**
 * RetryService: validates pipeline job state and restarts a failed job.
 *
 * Guards against retrying jobs in invalid states (running, pending, completed),
 * resets the job to the validate stage, and emits the event to restart the pipeline.
 *
 * Connections: SessionAdapter (db/), JobQueueAdapter (jobs/), EventBusAdapter (events/).
 */

import type { SessionAdapter } from '../db/session_adapter.js';
import type { JobQueueAdapter } from '../jobs/job_queue_adapter.js';
import type { EventBusAdapter } from '../events/event_bus_adapter.js';
import { PipelineStage } from '../../shared/types/pipeline.js';
import { RateLimiter } from '../utils/rate_limiter.js';

export interface RetryServiceDeps {
  sessionRepository: SessionAdapter;
  jobQueue: JobQueueAdapter;
  eventBus: EventBusAdapter;
}

export interface RetryResult {
  sessionId: string;
  jobId: string;
  message: string;
}

export type RetryServiceResult =
  | { ok: true; data: RetryResult }
  | { ok: false; status: 400 | 404 | 409 | 429; error: string };

/**
 * RetryService validates state and restarts a failed pipeline job from the validate stage.
 */
export class RetryService {
  private readonly sessionRepository: SessionAdapter;
  private readonly jobQueue: JobQueueAdapter;
  private readonly eventBus: EventBusAdapter;
  private readonly rateLimiter = new RateLimiter(30_000);

  constructor(deps: RetryServiceDeps) {
    this.sessionRepository = deps.sessionRepository;
    this.jobQueue = deps.jobQueue;
    this.eventBus = deps.eventBus;
  }

  /**
   * Validate state and restart a failed pipeline job from the validate stage.
   * Returns 404 if the session is unknown, 400 if no job exists or state is invalid,
   * 409 if the job is currently running.
   */
  async retry(sessionId: string): Promise<RetryServiceResult> {
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      return { ok: false, status: 404, error: 'Session not found' };
    }

    if (!this.rateLimiter.tryAcquire(sessionId)) {
      return { ok: false, status: 429, error: 'Rate limited — try again later' };
    }

    const job = await this.jobQueue.findBySessionId(sessionId);
    if (!job) {
      return { ok: false, status: 400, error: 'No job found for this session — nothing to retry' };
    }

    if (job.attempts >= job.maxAttempts) {
      return { ok: false, status: 400, error: `Maximum retry attempts (${job.maxAttempts}) exceeded` };
    }

    if (job.status === 'running') {
      return { ok: false, status: 409, error: 'Session is already processing — cannot retry a running job' };
    }

    if (job.status === 'pending' || job.status === 'completed') {
      return {
        ok: false,
        status: 400,
        error: `Cannot retry a job in '${job.status}' state — only failed jobs can be retried`,
      };
    }

    await this.jobQueue.retry(job.id, PipelineStage.Validate);
    this.eventBus.emit({ type: 'session.uploaded', sessionId, filename: session.filename });

    return { ok: true, data: { sessionId, jobId: job.id, message: 'Retry started' } };
  }
}
