/**
 * Session routes: list, retrieve, and delete sessions.
 */

import type { Context } from 'hono';
import { parseAsciicast } from '../../shared/asciicast.js';
import { readSession, deleteSession } from '../storage.js';
import type { SessionRepository } from '../db/session-repository.js';

/**
 * Handle GET /api/sessions
 * List all sessions with metadata.
 */
export function handleListSessions(
  c: Context,
  repository: SessionRepository
): Response {
  try {
    const sessions = repository.findAll();
    return c.json(sessions);
  } catch (err) {
    console.error('List sessions error:', err);
    return c.json(
      {
        error: 'Failed to list sessions',
        details: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
}

/**
 * Handle GET /api/sessions/:id
 * Retrieve session metadata and full parsed content.
 */
export function handleGetSession(
  c: Context,
  repository: SessionRepository
): Response {
  try {
    const id = c.req.param('id');

    // Find session metadata
    const session = repository.findById(id);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    // Read and parse session file
    const content = readSession(session.filepath);
    const parsed = parseAsciicast(content);

    // Return metadata + parsed content
    return c.json({
      ...session,
      content: parsed,
    });
  } catch (err) {
    console.error('Get session error:', err);

    // Handle file not found specifically
    if (err instanceof Error && err.message.includes('not found')) {
      return c.json(
        { error: 'Session file not found on filesystem' },
        404
      );
    }

    return c.json(
      {
        error: 'Failed to retrieve session',
        details: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
}

/**
 * Handle DELETE /api/sessions/:id
 * Delete session from both DB and filesystem.
 * Transactional: delete DB first, then file. If file delete fails, session is already gone from DB.
 */
export function handleDeleteSession(
  c: Context,
  repository: SessionRepository
): Response {
  try {
    const id = c.req.param('id');

    // Find session to get filepath
    const session = repository.findById(id);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    // Delete from DB first
    const deleted = repository.deleteById(id);
    if (!deleted) {
      return c.json({ error: 'Failed to delete session from database' }, 500);
    }

    // Then delete file (best effort - DB is source of truth)
    try {
      deleteSession(session.filepath);
    } catch (err) {
      // Log but don't fail - DB deletion succeeded
      console.warn('Failed to delete session file:', err);
    }

    return c.json({ success: true });
  } catch (err) {
    console.error('Delete session error:', err);
    return c.json(
      {
        error: 'Failed to delete session',
        details: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
}
