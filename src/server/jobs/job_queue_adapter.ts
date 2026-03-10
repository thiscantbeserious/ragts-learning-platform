/**
 * Job queue interface for crash-resilient pipeline processing state.
 *
 * Jobs are created per session and advance through pipeline stages.
 * The queue supports retry and boot-time recovery of interrupted jobs.
 */

import type { PipelineStage } from '../../shared/types/pipeline.js';

/** A single processing job linked to one session. */
export interface Job {
  id: string;
  sessionId: string;
  currentStage: PipelineStage;
  status: 'pending' | 'running' | 'completed' | 'failed';
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Persistent queue for pipeline jobs.
 * Methods are async for future backend compatibility (e.g. PostgreSQL).
 * The SQLite implementation executes synchronously via better-sqlite3.
 */
export interface JobQueueAdapter {
  /** Create a new pending job at the validate stage for the given session. */
  create(sessionId: string): Promise<Job>;

  /** Find the job associated with a session ID. Returns null if none exists. */
  findBySessionId(sessionId: string): Promise<Job | null>;

  /**
   * Update the job's current_stage.
   * Used by the orchestrator when advancing through the pipeline.
   */
  advance(jobId: string, nextStage: PipelineStage): Promise<void>;

  /** Mark a job as running and record start time. Increments attempt count. */
  start(jobId: string): Promise<void>;

  /** Mark a job as completed and record completion time. */
  complete(jobId: string): Promise<void>;

  /** Mark a job as failed and record the error message. */
  fail(jobId: string, error: string): Promise<void>;

  /**
   * Reset a failed job for retry from a given stage.
   * Sets status to pending and increments the attempt count.
   */
  retry(jobId: string, fromStage: PipelineStage): Promise<void>;

  /** Find all jobs with status 'pending'. */
  findPending(): Promise<Job[]>;

  /**
   * Mark running jobs as pending for re-processing.
   * Called on boot to recover jobs that were mid-flight when the server stopped.
   * Returns the count of jobs that were recovered.
   */
  recoverInterrupted(): Promise<number>;
}
