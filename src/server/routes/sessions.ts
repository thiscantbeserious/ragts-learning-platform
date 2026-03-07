/**
 * Session routes: list, retrieve, and delete sessions.
 */

import type { Context } from 'hono';
import { parseAsciicast } from '../../shared/asciicast.js';
import type { SessionAdapter } from '../db/session_adapter.js';
import type { SectionAdapter } from '../db/section_adapter.js';
import type { StorageAdapter } from '../storage/storage_adapter.js';
import { processSessionPipeline, trackPipeline } from '../processing/index.js';

/**
 * Handle GET /api/sessions
 * List all sessions with metadata.
 */
export async function handleListSessions(
  c: Context,
  repository: SessionAdapter
): Promise<Response> {
  try {
    const sessions = await repository.findAll();
    return c.json(sessions.map(({ filepath: _filepath, ...rest }) => rest));
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
 * Retrieve session metadata, full parsed content, and sections.
 */
export async function handleGetSession(
  c: Context,
  repository: SessionAdapter,
  sectionRepository: SectionAdapter,
  storageAdapter: StorageAdapter
): Promise<Response> {
  try {
    const id = c.req.param('id');

    // Find session metadata
    const session = await repository.findById(id);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    // Read and parse session file
    const content = await storageAdapter.read(id);
    const parsed = parseAsciicast(content);

    // Get sections for this session
    const sections = await sectionRepository.findBySessionId(id);

    // Parse session snapshot from JSON (if available)
    let snapshot = null;
    if (session.snapshot) {
      try {
        snapshot = JSON.parse(session.snapshot);
      } catch (err) {
        console.warn('Failed to parse session snapshot JSON:', err);
        // Continue without snapshot rather than failing the entire request
      }
    }

    // Transform sections to include parsed snapshot (if present)
    const transformedSections = sections.map(section => ({
      id: section.id,
      type: section.type,
      label: section.label,
      startEvent: section.start_event,
      endEvent: section.end_event,
      startLine: section.start_line,
      endLine: section.end_line,
      snapshot: section.snapshot ? (() => {
        try {
          return JSON.parse(section.snapshot);
        } catch (err) {
          console.warn(`Failed to parse snapshot for section ${section.id}:`, err);
          return null;
        }
      })() : null,
    }));

    // Return metadata + parsed content (header + markers only) + sections + snapshot
    // Strip filepath and database snapshot field from response
    const { filepath: _fp, snapshot: _snap, ...sessionData } = session;
    return c.json({
      ...sessionData,
      snapshot,
      content: {
        header: parsed.header,
        markers: parsed.markers,
      },
      sections: transformedSections,
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
export async function handleDeleteSession(
  c: Context,
  repository: SessionAdapter,
  storageAdapter: StorageAdapter
): Promise<Response> {
  try {
    const id = c.req.param('id');

    // Find session to verify it exists
    const session = await repository.findById(id);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    // Delete from DB first
    const deleted = await repository.deleteById(id);
    if (!deleted) {
      return c.json({ error: 'Failed to delete session from database' }, 500);
    }

    // Then delete file via adapter (best effort — DB is source of truth)
    try {
      await storageAdapter.delete(id);
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

/**
 * Handle POST /api/sessions/:id/redetect
 * Re-run section detection on an existing session.
 * Replaces all existing sections (both marker and detected).
 * Returns 202 Accepted immediately, processing happens async.
 */
export async function handleRedetect(
  c: Context,
  sessionRepository: SessionAdapter,
  sectionRepository: SectionAdapter,
  storageAdapter: StorageAdapter
): Promise<Response> {
  try {
    const id = c.req.param('id');

    // Find session
    const session = await sessionRepository.findById(id);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    // Read and parse session file to get markers
    const content = await storageAdapter.read(id);
    const parsed = parseAsciicast(content);

    // Trigger async processing (tracked, non-blocking)
    const pipeline = processSessionPipeline(
      session.filepath,
      id,
      parsed.markers,
      sectionRepository,
      sessionRepository
    ).catch(err => console.error('Re-detection failed:', err));
    trackPipeline(pipeline);

    // Return 202 Accepted
    return c.json(
      {
        message: 'Re-detection started',
        sessionId: id,
      },
      202
    );
  } catch (err) {
    console.error('Redetect error:', err);
    return c.json(
      {
        error: 'Failed to start re-detection',
        details: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
}
