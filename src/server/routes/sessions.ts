/**
 * Session routes: list, retrieve, and delete sessions.
 */

import type { Context } from 'hono';
import { parseAsciicast } from '../../shared/asciicast.js';
import type { SessionAdapter } from '../db/session_adapter.js';
import type { SectionAdapter } from '../db/section_adapter.js';
import type { StorageAdapter } from '../storage/storage_adapter.js';
import type { JobQueueAdapter } from '../jobs/job_queue_adapter.js';
import type { EventBusAdapter } from '../events/event_bus_adapter.js';
import { PipelineStage } from '../../shared/pipeline_events.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'routes' });

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
    log.error({ err }, 'List sessions error');
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
        log.warn({ err }, 'Failed to parse session snapshot JSON');
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
          log.warn({ err, sectionId: section.id }, 'Failed to parse section snapshot');
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
    log.error({ err }, 'Get session error');

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
      log.warn({ err }, 'Failed to delete session file');
    }

    return c.json({ success: true });
  } catch (err) {
    log.error({ err }, 'Delete session error');
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
 * Returns 202 Accepted immediately; the orchestrator handles processing via event bus.
 */
export async function handleRedetect(
  c: Context,
  sessionRepository: SessionAdapter,
  storageAdapter: StorageAdapter,
  jobQueue: JobQueueAdapter,
  eventBus: EventBusAdapter
): Promise<Response> {
  try {
    const id = c.req.param('id');

    const session = await sessionRepository.findById(id);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    // Read and parse to verify the file is accessible
    const content = await storageAdapter.read(id);
    parseAsciicast(content); // validate file is still parseable

    // Upsert job: replace existing job if present, then emit session.uploaded
    const existing = await jobQueue.findBySessionId(id);
    if (existing && (existing.status === 'pending' || existing.status === 'running')) {
      // Already queued or running — return 202 without re-creating
      return c.json({ message: 'Re-detection already in progress', sessionId: id }, 202);
    }

    if (existing) {
      // Re-queue a completed or failed job for re-detection
      await jobQueue.retry(existing.id, PipelineStage.Validate);
    } else {
      await jobQueue.create(id);
    }

    eventBus.emit({ type: 'session.uploaded', sessionId: id, filename: session.filename });

    return c.json({ message: 'Re-detection started', sessionId: id }, 202);
  } catch (err) {
    log.error({ err }, 'Redetect error');
    return c.json(
      {
        error: 'Failed to start re-detection',
        details: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
}
