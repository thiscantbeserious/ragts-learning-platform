/**
 * Route handler for GET /api/sessions/:id/snapshot.
 *
 * Returns the session-level terminal snapshot for sessions with 0 sections.
 * Used as a fallback display when section boundaries were not detected.
 *
 * Connections: SessionService (services/).
 */

import type { Context } from 'hono';
import type { SessionService } from '../services/index.js';
import { validatePathId } from './route_validation.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'routes/session_snapshot' });

/**
 * Handle GET /api/sessions/:id/snapshot
 * Returns the session-level terminal snapshot (null when none stored).
 * Intended for 0-section sessions that have no per-section content endpoints.
 */
export async function handleGetSessionSnapshot(
  c: Context,
  service: SessionService
): Promise<Response> {
  try {
    const id = c.req.param('id');
    const invalid = validatePathId(c, id);
    if (invalid) return invalid;

    const result = await service.getSessionSnapshot(id);
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result.data);
  } catch (err) {
    log.error({ err }, 'Get session snapshot error');
    return c.json({ error: 'Failed to retrieve session snapshot' }, 500);
  }
}
