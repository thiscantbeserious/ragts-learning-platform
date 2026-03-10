/**
 * StatusService: retrieves current pipeline job status for a session.
 *
 * Looks up a session by ID and returns its associated job status, or a
 * synthetic completed record for pre-upgrade sessions that have no job row.
 *
 * Connections: SessionAdapter (db/), JobQueueAdapter (jobs/).
 */

import type { SessionAdapter } from '../db/session_adapter.js';
import type { JobQueueAdapter } from '../jobs/job_queue_adapter.js';
import type { SessionStatusResponse } from '../../shared/types/api.js';

export interface StatusServiceDeps {
  sessionRepository: SessionAdapter;
  jobQueue: JobQueueAdapter;
}

/** Alias for the shared SessionStatusResponse type. */
export type SessionStatusResult = SessionStatusResponse;

export type StatusResult =
  | { ok: true; data: SessionStatusResult }
  | { ok: false; status: 404; error: string };

/**
 * StatusService returns the current pipeline job status for a session.
 */
export class StatusService {
  private readonly sessionRepository: SessionAdapter;
  private readonly jobQueue: JobQueueAdapter;

  constructor(deps: StatusServiceDeps) {
    this.sessionRepository = deps.sessionRepository;
    this.jobQueue = deps.jobQueue;
  }

  /**
   * Get the processing job status for a session.
   * Returns a synthetic completed record for pre-upgrade sessions with no job row.
   * Returns 404 if the session does not exist.
   */
  async getStatus(sessionId: string): Promise<StatusResult> {
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      return { ok: false, status: 404, error: 'Session not found' };
    }

    const job = await this.jobQueue.findBySessionId(sessionId);
    if (!job) {
      return {
        ok: true,
        data: {
          sessionId,
          status: 'completed',
          currentStage: null,
          attempts: 0,
          maxAttempts: 0,
          lastError: null,
          startedAt: null,
          completedAt: null,
        },
      };
    }

    return {
      ok: true,
      data: {
        sessionId,
        status: job.status,
        currentStage: job.currentStage,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        lastError: job.lastError,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      },
    };
  }
}
