/**
 * Event log API endpoint.
 *
 * Returns the chronological history of pipeline events for a session.
 * Used for debugging and observability. Pre-upgrade sessions with no
 * events return an empty array instead of an error.
 *
 * Connections: EventLogAdapter (events/), SessionAdapter (db/).
 */

import type { Context } from 'hono';
import type { SessionAdapter } from '../db/session_adapter.js';
import type { EventLogAdapter } from '../events/event_log_adapter.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'routes/event-log' });

/**
 * Handle GET /api/events?sessionId=<id>
 * Returns all pipeline events for a session ordered by id ASC.
 * Returns 400 if sessionId is missing, 404 if session not found.
 */
export async function handleGetEventLog(
  c: Context,
  sessionRepository: SessionAdapter,
  eventLog: EventLogAdapter
): Promise<Response> {
  try {
    const sessionId = c.req.query('sessionId');
    if (!sessionId) {
      return c.json({ error: 'sessionId query parameter is required' }, 400);
    }

    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    const entries = await eventLog.findBySessionId(sessionId);
    return c.json(entries);
  } catch (err) {
    log.error({ err }, 'Get event log error');
    return c.json(
      {
        error: 'Failed to retrieve event log',
        details: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
}
