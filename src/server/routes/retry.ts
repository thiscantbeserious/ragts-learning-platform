/**
 * Retry endpoint for failed or interrupted pipeline jobs.
 *
 * Resets the job to the validate stage and emits session.uploaded
 * so the orchestrator picks it up again.
 *
 * Connections: JobQueueAdapter (jobs/), EventBusAdapter (events/), SessionAdapter (db/).
 */

import type { Context } from 'hono';
import type { SessionAdapter } from '../db/session_adapter.js';
import type { JobQueueAdapter } from '../jobs/job_queue_adapter.js';
import type { EventBusAdapter } from '../events/event_bus_adapter.js';
import { PipelineStage } from '../../shared/pipeline_events.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'routes/retry' });

/**
 * Handle POST /api/sessions/:id/retry
 * Starts a retry from the validate stage for failed or interrupted jobs.
 * Returns 404 for unknown sessions, 400 for invalid state, 409 for running jobs.
 */
export async function handleRetry(
  c: Context,
  sessionRepository: SessionAdapter,
  jobQueue: JobQueueAdapter,
  eventBus: EventBusAdapter
): Promise<Response> {
  try {
    const id = c.req.param('id');

    const session = await sessionRepository.findById(id);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    const job = await jobQueue.findBySessionId(id);

    if (!job) {
      return c.json(
        { error: 'No job found for this session — nothing to retry' },
        400
      );
    }

    if (job.status === 'running') {
      return c.json(
        { error: 'Session is already processing — cannot retry a running job' },
        409
      );
    }

    if (job.status === 'pending' || job.status === 'completed') {
      return c.json(
        { error: `Cannot retry a job in '${job.status}' state — only failed jobs can be retried` },
        400
      );
    }

    // job.status === 'failed' — reset to validate stage
    await jobQueue.retry(job.id, PipelineStage.Validate);
    eventBus.emit({ type: 'session.uploaded', sessionId: id, filename: session.filename });

    return c.json({ sessionId: id, jobId: job.id, message: 'Retry started' });
  } catch (err) {
    log.error({ err }, 'Retry error');
    return c.json(
      {
        error: 'Failed to start retry',
        details: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
}
