/**
 * Retry route — thin handler delegating to RetryService.
 *
 * Connections: RetryService (services/).
 */

import type { Context } from 'hono';
import type { RetryService } from '../services/index.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'routes/retry' });

/**
 * Handle POST /api/sessions/:id/retry
 * Starts a retry from the validate stage for failed or interrupted jobs.
 */
export async function handleRetry(
  c: Context,
  service: RetryService
): Promise<Response> {
  try {
    const id = c.req.param('id');
    const result = await service.retry(id);
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result.data);
  } catch (err) {
    log.error({ err }, 'Retry error');
    return c.json({ error: 'Failed to start retry' }, 500);
  }
}
