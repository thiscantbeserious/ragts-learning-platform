/**
 * Session status endpoint.
 *
 * Returns the current processing stage and status from the job queue.
 * Used for initial UI hydration before SSE connects.
 *
 * Connections: JobQueueAdapter (jobs/), SessionAdapter (db/).
 */

import type { Context } from 'hono';
import type { SessionAdapter } from '../db/session_adapter.js';
import type { JobQueueAdapter } from '../jobs/job_queue_adapter.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'routes/status' });

/**
 * Handle GET /api/sessions/:id/status
 * Returns current job status; 404 if session doesn't exist.
 * If no job exists, returns { status: 'completed', currentStage: null } for pre-upgrade sessions.
 */
export async function handleGetStatus(
  c: Context,
  sessionRepository: SessionAdapter,
  jobQueue: JobQueueAdapter
): Promise<Response> {
  try {
    const id = c.req.param('id');

    const session = await sessionRepository.findById(id);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    const job = await jobQueue.findBySessionId(id);
    if (!job) {
      return c.json({
        sessionId: id,
        status: 'completed',
        currentStage: null,
        attempts: 0,
        maxAttempts: 0,
        lastError: null,
        startedAt: null,
        completedAt: null,
      });
    }

    return c.json({
      sessionId: id,
      status: job.status,
      currentStage: job.currentStage,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      lastError: job.lastError,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    });
  } catch (err) {
    log.error({ err }, 'Get session status error');
    return c.json(
      {
        error: 'Failed to retrieve session status',
        details: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
}
