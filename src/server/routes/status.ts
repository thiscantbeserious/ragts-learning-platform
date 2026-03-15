/**
 * Session status route — thin handler delegating to StatusService.
 *
 * Connections: StatusService (services/).
 */

import typia from 'typia';
import type { Context } from 'hono';
import type { StatusService } from '../services/index.js';
import type { SessionStatusResponse } from '../../shared/types/api.js';
import { validatePathId } from './route_validation.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'routes/status' });

/**
 * Handle GET /api/sessions/:id/status
 * Returns current job status; 404 if session doesn't exist.
 */
export async function handleGetStatus(
  c: Context,
  service: StatusService
): Promise<Response> {
  try {
    const id = c.req.param('id');
    const invalid = validatePathId(c, id);
    if (invalid) return invalid;
    const result = await service.getStatus(id);
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    const validation = typia.validate<SessionStatusResponse>(result.data);
    if (!validation.success) {
      log.warn({ errors: validation.errors }, 'Response validation warning: session status shape mismatch');
    }
    return c.json(result.data);
  } catch (err) {
    log.error({ err }, 'Get session status error');
    return c.json({ error: 'Failed to retrieve session status' }, 500);
  }
}
