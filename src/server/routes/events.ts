/**
 * Events route — GET /api/events pipeline event history for a session.
 * Thin handler delegating to EventLogService.
 *
 * Connections: EventLogService (services/).
 */

import type { Context } from 'hono';
import type { EventLogService } from '../services/index.js';
import { validateQueryParam } from './route_validation.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'routes/events' });

/**
 * Handle GET /api/events?sessionId=<id>
 * Returns all pipeline events for a session ordered by id ASC.
 * Returns 400 if sessionId is missing, 404 if session not found.
 */
export async function handleGetEventLog(
  c: Context,
  service: EventLogService
): Promise<Response> {
  try {
    const sessionId = c.req.query('sessionId');
    if (sessionId !== undefined) {
      const invalid = validateQueryParam(c, 'sessionId', sessionId);
      if (invalid) return invalid;
    }
    const result = await service.getEvents(sessionId);
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result.data);
  } catch (err) {
    log.error({ err }, 'Get event log error');
    return c.json({ error: 'Failed to retrieve event log' }, 500);
  }
}
