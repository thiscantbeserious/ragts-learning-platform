/**
 * SQLite implementation of JobQueue using better-sqlite3.
 *
 * All DB calls are synchronous (better-sqlite3 API) but the public interface
 * is async for future backend compatibility.
 *
 * Connections: uses the same DB instance as other SQLite repositories,
 * passed via constructor. Jobs table created by migration 004.
 */

import Database from '../db/sqlite/node_sqlite_compat.js';
import { nanoid } from 'nanoid';
import type { Job, JobQueueAdapter } from './job_queue_adapter.js';
import { PipelineStage } from '../../shared/types/pipeline.js';

/** Maps a raw DB row to the typed Job interface. */
function rowToJob(row: Record<string, unknown>): Job {
  return {
    id: row['id'] as string,
    sessionId: row['session_id'] as string,
    currentStage: row['current_stage'] as PipelineStage,
    status: row['status'] as Job['status'],
    attempts: row['attempts'] as number,
    maxAttempts: row['max_attempts'] as number,
    lastError: (row['last_error'] as string | null) ?? null,
    startedAt: (row['started_at'] as string | null) ?? null,
    completedAt: (row['completed_at'] as string | null) ?? null,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}

/** SQLite-backed job queue. Uses prepared statements for performance. */
export class SqliteJobQueueImpl implements JobQueueAdapter {
  private readonly insertStmt: Database.Statement;
  private readonly findBySessionIdStmt: Database.Statement;
  private readonly findByIdStmt: Database.Statement;
  private readonly startStmt: Database.Statement;
  private readonly advanceStmt: Database.Statement;
  private readonly completeStmt: Database.Statement;
  private readonly failStmt: Database.Statement;
  private readonly retryStmt: Database.Statement;
  private readonly findPendingStmt: Database.Statement;
  private readonly recoverStmt: Database.Statement;
  private readonly countRecoveredStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO jobs (id, session_id, current_stage, status, attempts, max_attempts)
      VALUES (?, ?, 'validate', 'pending', 0, 3)
    `);

    this.findBySessionIdStmt = db.prepare(`
      SELECT * FROM jobs WHERE session_id = ?
    `);

    this.findByIdStmt = db.prepare(`
      SELECT * FROM jobs WHERE id = ?
    `);

    this.startStmt = db.prepare(`
      UPDATE jobs
      SET status = 'running',
          started_at = datetime('now'),
          attempts = attempts + 1
      WHERE id = ? AND status = 'pending'
    `);

    this.advanceStmt = db.prepare(`
      UPDATE jobs SET current_stage = ? WHERE id = ?
    `);

    this.completeStmt = db.prepare(`
      UPDATE jobs
      SET status = 'completed',
          completed_at = datetime('now')
      WHERE id = ?
    `);

    this.failStmt = db.prepare(`
      UPDATE jobs SET status = 'failed', last_error = ? WHERE id = ?
    `);

    this.retryStmt = db.prepare(`
      UPDATE jobs
      SET status = 'pending',
          current_stage = ?,
          last_error = NULL,
          started_at = NULL,
          completed_at = NULL
      WHERE id = ?
    `);

    this.findPendingStmt = db.prepare(`
      SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at ASC
    `);

    // Count before re-queuing as pending (for return value)
    this.countRecoveredStmt = db.prepare(`
      SELECT COUNT(*) as cnt FROM jobs WHERE status = 'running'
    `);

    this.recoverStmt = db.prepare(`
      UPDATE jobs
      SET status = 'pending',
          last_error = 'Server restarted — job interrupted',
          current_stage = 'validate'
      WHERE status = 'running'
    `);
  }

  async create(sessionId: string): Promise<Job> {
    const id = nanoid();
    this.insertStmt.run(id, sessionId);
    const row = this.findByIdStmt.get(id) as Record<string, unknown>;
    return rowToJob(row);
  }

  async findBySessionId(sessionId: string): Promise<Job | null> {
    const row = this.findBySessionIdStmt.get(sessionId) as Record<string, unknown> | undefined;
    return row ? rowToJob(row) : null;
  }

  async start(jobId: string): Promise<void> {
    const result = this.startStmt.run(jobId);
    if (result.changes === 0) {
      throw new Error(`Job ${jobId} cannot be started — not in pending state`);
    }
  }

  async advance(jobId: string, nextStage: PipelineStage): Promise<void> {
    this.advanceStmt.run(nextStage, jobId);
  }

  async complete(jobId: string): Promise<void> {
    this.completeStmt.run(jobId);
  }

  async fail(jobId: string, error: string): Promise<void> {
    this.failStmt.run(error, jobId);
  }

  async retry(jobId: string, fromStage: PipelineStage): Promise<void> {
    this.retryStmt.run(fromStage, jobId);
  }

  async findPending(): Promise<Job[]> {
    const rows = this.findPendingStmt.all() as Array<Record<string, unknown>>;
    return rows.map(rowToJob);
  }

  async recoverInterrupted(): Promise<number> {
    const countRow = this.countRecoveredStmt.get() as { cnt: number };
    const count = countRow.cnt;
    if (count > 0) {
      this.recoverStmt.run();
    }
    return count;
  }
}
