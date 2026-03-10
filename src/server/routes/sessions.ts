/**
 * Session routes: list, retrieve, delete, and redetect sessions.
 * Thin route layer — delegates to SessionService.
 */

import type { Context } from 'hono';
import type { SessionService } from '../services/index.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'routes/sessions' });

/**
 * Handle GET /api/sessions
 * List all sessions with metadata.
 */
export async function handleListSessions(
  c: Context,
  service: SessionService
): Promise<Response> {
  try {
    const sessions = await service.listSessions();
    return c.json(sessions);
  } catch (err) {
    log.error({ err }, 'List sessions error');
    return c.json({ error: 'Failed to list sessions' }, 500);
  }
}

/**
 * Handle GET /api/sessions/:id
 * Retrieve session metadata, full parsed content, and sections.
 */
export async function handleGetSession(
  c: Context,
  service: SessionService
): Promise<Response> {
  try {
    const id = c.req.param('id');
    const result = await service.getSession(id);
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result.data);
  } catch (err) {
    log.error({ err }, 'Get session error');
    return c.json({ error: 'Failed to retrieve session' }, 500);
  }
}

/**
 * Handle DELETE /api/sessions/:id
 * Delete session from both DB and filesystem.
 */
export async function handleDeleteSession(
  c: Context,
  service: SessionService
): Promise<Response> {
  try {
    const id = c.req.param('id');
    const result = await service.deleteSession(id);
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result.data);
  } catch (err) {
    log.error({ err }, 'Delete session error');
    return c.json({ error: 'Failed to delete session' }, 500);
  }
}

/**
 * Handle POST /api/sessions/:id/redetect
 * Re-run section detection on an existing session.
 * Returns 202 Accepted; orchestrator handles async processing.
 */
export async function handleRedetect(
  c: Context,
  service: SessionService
): Promise<Response> {
  try {
    const id = c.req.param('id');
    const result = await service.redetectSession(id);
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result.data, 202);
  } catch (err) {
    log.error({ err }, 'Redetect error');
    return c.json({ error: 'Failed to start re-detection' }, 500);
  }
}
